/**
 * Post creation with client-side media optimization.
 * Keeps the existing modal flow, but compresses media before upload.
 */

(function initPostCreation() {
  const MAX_IMAGE_BYTES = 200 * 1024;
  const MAX_VIDEO_BYTES = 1024 * 1024;
  const MAX_VIDEO_DURATION = 30;
  const MAX_IMAGE_WIDTH = 1080;
  const MAX_CAROUSEL_PHOTOS = 10;
  const MIN_VIDEO_CLIP_SECONDS = 1;

  const IMAGE_MODULE_URL = '/node_modules/browser-image-compression/dist/browser-image-compression.mjs';
  const IMAGE_WORKER_LIB_URL = '/node_modules/browser-image-compression/dist/browser-image-compression.js';
  const FFMPEG_MODULE_URL = '/node_modules/@ffmpeg/ffmpeg/dist/esm/index.js';
  const FFMPEG_UTIL_URL = '/node_modules/@ffmpeg/util/dist/esm/index.js';
  const FFMPEG_CORE_URL = '/node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.js';
  const FFMPEG_WASM_URL = '/node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.wasm';

  const PHOTO_IMAGE_PROFILES = [
    { fileType: 'image/webp', initialQuality: 0.92, maxWidthOrHeight: MAX_IMAGE_WIDTH },
    { fileType: 'image/webp', initialQuality: 0.84, maxWidthOrHeight: MAX_IMAGE_WIDTH },
    { fileType: 'image/jpeg', initialQuality: 0.82, maxWidthOrHeight: MAX_IMAGE_WIDTH },
    { fileType: 'image/jpeg', initialQuality: 0.74, maxWidthOrHeight: 960 },
    { fileType: 'image/jpeg', initialQuality: 0.68, maxWidthOrHeight: 880 },
  ];

  const VIDEO_PROFILES = [
    { label: 'hd', width: 1280, height: 720, videoKbpsCap: 850, audioKbps: 48, fps: 24 },
    { label: 'sd', width: 854, height: 480, videoKbpsCap: 420, audioKbps: 32, fps: 24 },
    { label: 'sd-lite', width: 854, height: 480, videoKbpsCap: 260, audioKbps: 0, fps: 20 },
  ];

  const PostCreator = {
    state: {
      postType: 'text',
      currentFiles: {
        photo: null,
        carousel: [],
        video: null,
      },
      mediaInfo: {
        photo: null,
        carousel: [],
        video: null,
      },
      previewUrls: {
        photo: '',
        video: '',
      },
      videoSourceUrl: '',
      videoPreviewLoop: {
        enabled: false,
        start: 0,
        end: 0,
      },
      videoTrim: {
        duration: 0,
        width: 0,
        height: 0,
        start: 0,
        end: 0,
      },
      isSubmitting: false,
      pendingTasks: {
        photo: 0,
        carousel: 0,
        video: 0,
      },
      activeOptimizations: 0,
      imageCompressionPromise: null,
      ffmpegPromise: null,
    },

    dom: {},

    init() {
      this.cacheDom();
      this.setupEventListeners();
      this.selectPostType(this.state.postType);
      this.resetForm();
    },

    cacheDom() {
      this.dom = {
        modal: document.getElementById('createModal'),
        closeBtn: document.querySelector('.modal-close'),
        form: document.getElementById('createForm'),
        submitBtn: document.getElementById('createSubmit'),
        cancelBtn: document.getElementById('createCancel'),

        typeOptions: document.querySelectorAll('.type-option'),

        postCategory: document.getElementById('postCategory'),
        postContent: document.getElementById('postContent'),
        charCount: document.getElementById('charCount'),

        photoInput: document.getElementById('photoInput'),
        photoSection: document.getElementById('photoSection'),
        photoPreview: document.getElementById('photoPreview'),
        photoPreviewImg: document.getElementById('photoPreviewImg'),
        photoCaption: document.getElementById('photoCaption'),
        photoCaptionCount: document.getElementById('photoCaptionCount'),
        photoStatus: document.getElementById('photoStatus'),

        carouselInput: document.getElementById('carouselInput'),
        carouselSection: document.getElementById('carouselSection'),
        carouselPreview: document.getElementById('carouselPreview'),
        carouselCaption: document.getElementById('carouselCaption'),
        carouselCaptionCount: document.getElementById('carouselCaptionCount'),

        videoInput: document.getElementById('videoInput'),
        videoSection: document.getElementById('videoSection'),
        videoPreview: document.getElementById('videoPreview'),
        videoPreviewVid: document.getElementById('videoPreviewVid'),
        videoCaption: document.getElementById('videoCaption'),
        videoCaptionCount: document.getElementById('videoCaptionCount'),
        videoStatus: document.getElementById('videoStatus'),
        videoTrimPanel: document.getElementById('videoTrimPanel'),
        videoTrimStart: document.getElementById('videoTrimStart'),
        videoTrimEnd: document.getElementById('videoTrimEnd'),
        videoTrimStartValue: document.getElementById('videoTrimStartValue'),
        videoTrimEndValue: document.getElementById('videoTrimEndValue'),
        videoTrimDuration: document.getElementById('videoTrimDuration'),

        hashtags: document.getElementById('hashtags'),
        location: document.getElementById('location'),
        privacy: document.getElementById('privacy'),
        allowComments: document.getElementById('allowComments'),
        allowLikes: document.getElementById('allowLikes'),

        uploadProgress: document.getElementById('uploadProgress'),
        progressFill: document.getElementById('progressFill'),
        progressText: document.getElementById('progressText'),

        commonFields: document.getElementById('commonFields'),
        textSection: document.getElementById('textSection'),
      };
    },

    setupEventListeners() {
      this.dom.closeBtn?.addEventListener('click', () => this.closeModal());
      this.dom.cancelBtn?.addEventListener('click', () => this.closeModal());
      this.dom.modal?.addEventListener('click', (event) => {
        if (event.target === this.dom.modal) {
          this.closeModal();
        }
      });

      this.dom.typeOptions.forEach((option) => {
        option.addEventListener('click', () => this.selectPostType(option.dataset.type));
      });

      this.dom.photoInput?.addEventListener('change', (event) => this.handlePhotoSelect(event));
      this.dom.carouselInput?.addEventListener('change', (event) => this.handleCarouselSelect(event));
      this.dom.videoInput?.addEventListener('change', (event) => this.handleVideoSelect(event));

      this.dom.form?.addEventListener('submit', (event) => this.handleSubmit(event));

      this.dom.postContent?.addEventListener('input', () => this.updateCharCount('postContent', 'charCount'));
      this.dom.photoCaption?.addEventListener('input', () => this.updateCharCount('photoCaption', 'photoCaptionCount'));
      this.dom.carouselCaption?.addEventListener('input', () => this.updateCharCount('carouselCaption', 'carouselCaptionCount'));
      this.dom.videoCaption?.addEventListener('input', () => this.updateCharCount('videoCaption', 'videoCaptionCount'));

      this.dom.videoTrimStart?.addEventListener('input', () => this.handleVideoTrimInput('start'));
      this.dom.videoTrimEnd?.addEventListener('input', () => this.handleVideoTrimInput('end'));
      this.dom.videoTrimStart?.addEventListener('change', () => this.handleVideoTrimCommit());
      this.dom.videoTrimEnd?.addEventListener('change', () => this.handleVideoTrimCommit());

      this.dom.videoPreviewVid?.addEventListener('loadedmetadata', () => {
        if (!this.state.videoPreviewLoop.enabled) {
          return;
        }
        try {
          this.dom.videoPreviewVid.currentTime = this.state.videoPreviewLoop.start;
        } catch (_) {
          // Ignore preview seek issues on unsupported browsers.
        }
      });

      this.dom.videoPreviewVid?.addEventListener('timeupdate', () => {
        if (!this.state.videoPreviewLoop.enabled) {
          return;
        }
        const { start, end } = this.state.videoPreviewLoop;
        if (end > start && this.dom.videoPreviewVid.currentTime >= end) {
          this.dom.videoPreviewVid.currentTime = start;
          this.dom.videoPreviewVid.play().catch(() => {});
        }
      });

      document.addEventListener('click', (event) => {
        if (event.target.classList.contains('remove-media')) {
          event.preventDefault();
          const target = event.target.dataset.target;
          this.removeMedia(target);
        }
      });

      window.openCreatePostModal = () => this.openModal();
    },

    selectPostType(type) {
      this.state.postType = type;

      this.dom.typeOptions.forEach((option) => {
        option.classList.toggle('active', option.dataset.type === type);
      });

      const sectionMap = {
        text: this.dom.textSection,
        photo: this.dom.photoSection,
        carousel: this.dom.carouselSection,
        video: this.dom.videoSection,
      };

      Object.entries(sectionMap).forEach(([key, section]) => {
        if (!section) {
          return;
        }
        const isActive = key === type;
        section.classList.toggle('active', isActive);
        section.hidden = !isActive;
      });
    },

    async handlePhotoSelect(event) {
      const file = event.target.files?.[0];
      if (!file) {
        this.clearPhotoState();
        return;
      }

      if (!file.type.startsWith('image/')) {
        this.showError('Please select an image file.');
        this.clearPhotoState();
        return;
      }

      const taskId = this.bumpTask('photo');
      this.startOptimization();
      this.setStatus('photo', 'Optimizing image...', 'info');
      this.showProgress('Optimizing image...', 0);

      try {
        const optimized = await this.optimizeImage(file, (percent) => {
          if (!this.isTaskCurrent('photo', taskId)) {
            return;
          }
          this.updateProgress(percent, 'Optimizing image...');
        });

        if (!this.isTaskCurrent('photo', taskId)) {
          return;
        }

        this.state.currentFiles.photo = optimized.file;
        this.state.mediaInfo.photo = optimized;
        this.previewPhoto(optimized.file);
        this.setStatus('photo', `Optimizing image... ${optimized.reductionPercent}% reduced`, 'success');
      } catch (error) {
        if (!this.isTaskCurrent('photo', taskId)) {
          return;
        }
        this.clearPhotoState();
        this.showError(error.message || 'Could not optimize that image.');
      } finally {
        this.finishOptimization();
        if (this.isTaskCurrent('photo', taskId)) {
          this.hideProgress();
        }
      }
    },

    async handleCarouselSelect(event) {
      const files = Array.from(event.target.files || []);
      if (!files.length) {
        this.clearCarouselState();
        return;
      }

      if (files.length > MAX_CAROUSEL_PHOTOS) {
        this.showError(`Maximum ${MAX_CAROUSEL_PHOTOS} photos allowed.`);
        this.clearCarouselState();
        return;
      }

      const invalidFile = files.find((file) => !file.type.startsWith('image/'));
      if (invalidFile) {
        this.showError('All carousel files must be images.');
        this.clearCarouselState();
        return;
      }

      const taskId = this.bumpTask('carousel');
      this.startOptimization();
      this.showProgress('Optimizing images...', 0);

      try {
        const optimizedItems = [];
        const totalBytesBefore = files.reduce((sum, file) => sum + file.size, 0);

        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          const baseProgress = (index / files.length) * 100;
          const optimized = await this.optimizeImage(file, (itemPercent) => {
            if (!this.isTaskCurrent('carousel', taskId)) {
              return;
            }
            const scaled = Math.min(99, Math.round(baseProgress + (itemPercent / files.length)));
            this.updateProgress(scaled, `Optimizing images... ${index + 1}/${files.length}`);
          });

          if (!this.isTaskCurrent('carousel', taskId)) {
            return;
          }
          optimizedItems.push(optimized);
        }

        const totalBytesAfter = optimizedItems.reduce((sum, item) => sum + item.file.size, 0);
        const totalReduction = this.getReductionPercent(totalBytesBefore, totalBytesAfter);

        this.state.currentFiles.carousel = optimizedItems.map((item) => item.file);
        this.state.mediaInfo.carousel = optimizedItems;
        this.previewCarousel(optimizedItems);
        this.showSuccess(`Carousel optimized. ${totalReduction}% reduced.`);
      } catch (error) {
        if (!this.isTaskCurrent('carousel', taskId)) {
          return;
        }
        this.clearCarouselState();
        this.showError(error.message || 'Could not optimize the selected photos.');
      } finally {
        this.finishOptimization();
        if (this.isTaskCurrent('carousel', taskId)) {
          this.hideProgress();
        }
      }
    },

    async handleVideoSelect(event) {
      const file = event.target.files?.[0];
      if (!file) {
        this.clearVideoState();
        return;
      }

      if (!file.type.startsWith('video/')) {
        this.showError('Please select a video file.');
        this.clearVideoState();
        return;
      }

      const taskId = this.bumpTask('video');
      this.setStatus('video', 'Preparing trim selector...', 'info');
      this.showProgress('Preparing video...', 0);

      try {
        const metadata = await this.readVideoMetadata(file);
        if (!this.isTaskCurrent('video', taskId)) {
          return;
        }

        const defaultEnd = Math.min(metadata.duration, MAX_VIDEO_DURATION);

        this.state.mediaInfo.video = {
          originalFile: file,
          originalSize: file.size,
          originalDuration: metadata.duration,
          width: metadata.width,
          height: metadata.height,
          reductionPercent: 0,
        };
        this.state.videoTrim = {
          duration: metadata.duration,
          width: metadata.width,
          height: metadata.height,
          start: 0,
          end: defaultEnd,
        };

        this.configureVideoTrimControls(metadata.duration, defaultEnd);
        this.previewVideo(file, {
          loopStart: 0,
          loopEnd: defaultEnd,
        });
        this.setStatus('video', 'Trim your clip. It will be compressed automatically.', 'info');

        await this.compressCurrentVideoSelection(taskId);
      } catch (error) {
        if (!this.isTaskCurrent('video', taskId)) {
          return;
        }
        this.clearVideoState();
        this.showError(error.message || 'Could not prepare that video.');
      } finally {
        if (this.isTaskCurrent('video', taskId)) {
          this.hideProgress();
        }
      }
    },

    handleVideoTrimInput(changedEdge) {
      const trim = this.state.videoTrim;
      if (!trim.duration) {
        return;
      }

      let start = Number(this.dom.videoTrimStart?.value || 0);
      let end = Number(this.dom.videoTrimEnd?.value || trim.duration);

      start = Math.max(0, Math.min(start, trim.duration));
      end = Math.max(0, Math.min(end, trim.duration));

      if (changedEdge === 'start') {
        if (end - start > MAX_VIDEO_DURATION) {
          end = Math.min(trim.duration, start + MAX_VIDEO_DURATION);
        }
        if (end - start < MIN_VIDEO_CLIP_SECONDS) {
          end = Math.min(trim.duration, start + MIN_VIDEO_CLIP_SECONDS);
        }
      } else {
        if (end - start > MAX_VIDEO_DURATION) {
          start = Math.max(0, end - MAX_VIDEO_DURATION);
        }
        if (end - start < MIN_VIDEO_CLIP_SECONDS) {
          start = Math.max(0, end - MIN_VIDEO_CLIP_SECONDS);
        }
      }

      if (end <= start) {
        end = Math.min(trim.duration, start + MIN_VIDEO_CLIP_SECONDS);
      }

      trim.start = Number(start.toFixed(2));
      trim.end = Number(end.toFixed(2));

      if (this.dom.videoTrimStart) {
        this.dom.videoTrimStart.value = String(trim.start);
      }
      if (this.dom.videoTrimEnd) {
        this.dom.videoTrimEnd.value = String(trim.end);
      }

      this.updateVideoTrimReadout();

      const originalFile = this.state.mediaInfo.video?.originalFile;
      if (originalFile) {
        this.previewVideo(originalFile, {
          loopStart: trim.start,
          loopEnd: trim.end,
        });
      }
    },

    async handleVideoTrimCommit() {
      if (!this.state.mediaInfo.video?.originalFile) {
        return;
      }

      const taskId = this.bumpTask('video');
      try {
        await this.compressCurrentVideoSelection(taskId);
      } catch (_) {
        // UI state is already updated with the failure message.
      }
    },

    async handleSubmit(event) {
      event.preventDefault();

      if (this.state.isSubmitting) {
        return;
      }

      if (this.hasActiveOptimization()) {
        this.showInfo('Please wait for media optimization to finish.');
        return;
      }

      this.state.isSubmitting = true;
      this.dom.submitBtn.disabled = true;

      try {
        if (!this.validatePost()) {
          return;
        }

        const post = this.buildPostObject();

        if (this.state.currentFiles.photo || this.state.currentFiles.video || this.state.currentFiles.carousel.length > 0) {
          await this.uploadMedia(post);
        }

        await this.savePost(post);

        this.showSuccess('Post published!');
        this.closeModal();

        if (window.app && typeof window.app.loadHomeFeed === 'function') {
          await window.app.loadHomeFeed(true);
        }
        if (window.app && typeof window.app.loadReels === 'function') {
          await window.app.loadReels(true);
        }
      } catch (error) {
        this.showError(error.message || 'Failed to publish post.');
      } finally {
        this.state.isSubmitting = false;
        this.dom.submitBtn.disabled = false;
      }
    },

    validatePost() {
      const type = this.state.postType;

      if (type === 'text') {
        const content = this.dom.postContent?.value.trim() || '';
        if (!content) {
          this.showError('Please write something.');
          return false;
        }
      } else if (type === 'photo') {
        if (!this.state.currentFiles.photo) {
          this.showError('Please choose a photo first.');
          return false;
        }
      } else if (type === 'carousel') {
        if (!this.state.currentFiles.carousel.length) {
          this.showError('Please choose at least one photo.');
          return false;
        }
      } else if (type === 'video') {
        if (!this.state.currentFiles.video) {
          this.showError('Please trim and optimize a video first.');
          return false;
        }
        if (this.state.currentFiles.video.size > MAX_VIDEO_BYTES) {
          this.showError('Video too complex. Reduce length or quality.');
          return false;
        }
      }

      return true;
    },

    buildPostObject() {
      const user = window.SupabaseAuth?.getUser();
      if (!user?.id) {
        throw new Error('Login required to create a post.');
      }

      const selectedType = this.state.postType;
      const type = selectedType === 'video' ? 'reel' : selectedType === 'text' ? 'text' : 'image';

      return {
        user_id: user.id,
        type,
        category: type === 'text' ? (this.dom.postCategory?.value || null) : null,
        caption: this.getCaption(),
        content: type === 'text' ? (this.dom.postContent?.value.trim() || '') : null,
      };
    },

    getCaption() {
      if (this.state.postType === 'photo') {
        return this.dom.photoCaption?.value || '';
      }
      if (this.state.postType === 'carousel') {
        return this.dom.carouselCaption?.value || '';
      }
      if (this.state.postType === 'video') {
        return this.dom.videoCaption?.value || '';
      }
      return '';
    },

    async uploadMedia(post) {
      const hasMedia = this.state.currentFiles.photo || this.state.currentFiles.video || this.state.currentFiles.carousel.length > 0;
      if (!hasMedia) {
        return;
      }

      this.showProgress('Uploading media...', 0);

      try {
        if (this.state.postType === 'photo' && this.state.currentFiles.photo) {
          const urls = await this.uploadPhotos([this.state.currentFiles.photo]);
          post.image_url = urls[0] || null;
        } else if (this.state.postType === 'carousel' && this.state.currentFiles.carousel.length > 0) {
          const urls = await this.uploadPhotos(this.state.currentFiles.carousel);
          post.carousel_urls = urls;
          post.image_url = urls[0] || null;
        } else if (this.state.postType === 'video' && this.state.currentFiles.video) {
          const url = await this.uploadVideo(this.state.currentFiles.video);
          post.media_url = url;
        }
      } finally {
        this.hideProgress();
      }
    },

    async uploadPhotos(files) {
      const supabase = window.supabaseClient;
      const user = window.SupabaseAuth?.getUser();
      if (!supabase) {
        throw new Error('Supabase not initialized.');
      }
      if (!user?.id) {
        throw new Error('Login required to upload media.');
      }

      const urls = [];

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const extension = this.getExtensionFromMime(file.type, 'jpg');
        const path = `${user.id}/posts/${Date.now()}_${index}.${extension}`;

        const { error } = await supabase.storage
          .from('post-images')
          .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });

        if (error) {
          throw error;
        }

        const { data: publicData } = supabase.storage.from('post-images').getPublicUrl(path);
        urls.push(publicData.publicUrl);

        const progress = Math.round(((index + 1) / files.length) * 100);
        this.updateProgress(progress, 'Uploading media...');
      }

      return urls;
    },

    async uploadVideo(file) {
      const supabase = window.supabaseClient;
      const user = window.SupabaseAuth?.getUser();
      if (!supabase) {
        throw new Error('Supabase not initialized.');
      }
      if (!user?.id) {
        throw new Error('Login required to upload media.');
      }

      const path = `${user.id}/reels/${Date.now()}.mp4`;
      const { error } = await supabase.storage
        .from('reel-videos')
        .upload(path, file, { upsert: true, contentType: 'video/mp4' });

      if (error) {
        throw error;
      }

      const { data: publicData } = supabase.storage.from('reel-videos').getPublicUrl(path);
      this.updateProgress(100, 'Uploading media...');
      return publicData.publicUrl;
    },

    async optimizeImage(file, onProgress) {
      const imageCompression = await this.loadImageCompressionLibrary();
      let workingFile = file;
      let bestFile = file;

      for (let index = 0; index < PHOTO_IMAGE_PROFILES.length; index += 1) {
        const profile = PHOTO_IMAGE_PROFILES[index];
        const compressed = await imageCompression(workingFile, {
          maxSizeMB: MAX_IMAGE_BYTES / (1024 * 1024),
          maxWidthOrHeight: profile.maxWidthOrHeight,
          useWebWorker: true,
          libURL: IMAGE_WORKER_LIB_URL,
          fileType: profile.fileType,
          initialQuality: profile.initialQuality,
          maxIteration: 12,
          onProgress: (percent) => {
            if (typeof onProgress === 'function') {
              const scaled = Math.min(99, Math.round(((index + (percent / 100)) / PHOTO_IMAGE_PROFILES.length) * 100));
              onProgress(scaled);
            }
          },
        });

        const normalized = this.asFile(
          compressed,
          this.replaceExtension(file.name, this.getExtensionFromMime(profile.fileType, 'jpg')),
          profile.fileType
        );

        bestFile = normalized;

        if (normalized.size <= MAX_IMAGE_BYTES) {
          if (typeof onProgress === 'function') {
            onProgress(100);
          }
          return {
            file: normalized,
            originalSize: file.size,
            optimizedSize: normalized.size,
            reductionPercent: this.getReductionPercent(file.size, normalized.size),
          };
        }

        workingFile = normalized;
      }

      if (bestFile.size <= MAX_IMAGE_BYTES) {
        return {
          file: bestFile,
          originalSize: file.size,
          optimizedSize: bestFile.size,
          reductionPercent: this.getReductionPercent(file.size, bestFile.size),
        };
      }

      throw new Error('Image is too detailed to fit under 200KB. Try cropping it first.');
    },

    async compressCurrentVideoSelection(taskId) {
      const info = this.state.mediaInfo.video;
      if (!info?.originalFile) {
        return;
      }

      if (typeof taskId !== 'number') {
        taskId = this.bumpTask('video');
      }

      const clipDuration = Number((this.state.videoTrim.end - this.state.videoTrim.start).toFixed(2));
      if (clipDuration > MAX_VIDEO_DURATION) {
        throw new Error(`Video clips must stay within ${MAX_VIDEO_DURATION} seconds.`);
      }
      if (clipDuration < MIN_VIDEO_CLIP_SECONDS) {
        throw new Error('Please keep at least 1 second of video.');
      }

      this.setStatus('video', 'Compressing video... please wait', 'info');
      this.showProgress('Compressing video... please wait', 0);
      this.startOptimization();

      try {
        const optimized = await this.optimizeVideo(info.originalFile, {
          start: this.state.videoTrim.start,
          end: this.state.videoTrim.end,
          width: this.state.videoTrim.width,
          height: this.state.videoTrim.height,
          originalDuration: info.originalDuration,
          onProgress: (percent) => {
            if (!this.isTaskCurrent('video', taskId)) {
              return;
            }
            this.updateProgress(percent, 'Compressing video... please wait');
          },
        });

        if (!this.isTaskCurrent('video', taskId)) {
          return;
        }

        this.state.currentFiles.video = optimized.file;
        this.state.mediaInfo.video = {
          ...info,
          ...optimized,
        };
        this.previewVideo(optimized.file);
        this.setStatus('video', `Ready to upload. ${optimized.reductionPercent}% reduced.`, 'success');
      } catch (error) {
        if (!this.isTaskCurrent('video', taskId)) {
          return;
        }
        this.state.currentFiles.video = null;
        this.setStatus('video', error.message || 'Video too complex. Reduce length or quality.', 'error');
        throw error;
      } finally {
        this.finishOptimization();
        if (this.isTaskCurrent('video', taskId)) {
          this.hideProgress();
        }
      }
    },

    async optimizeVideo(file, options) {
      const { ffmpeg, fetchFile } = await this.loadFFmpeg();
      const { start, end, width, height, onProgress } = options;
      const clipDuration = Number((end - start).toFixed(2));
      const sourceExt = this.getExtensionFromMime(file.type, 'mp4');
      const inputName = `input-${Date.now()}.${sourceExt}`;
      const outputName = `output-${Date.now()}.mp4`;
      const sourceData = await fetchFile(file);

      let bestFile = null;

      const progressHandler = ({ progress }) => {
        if (typeof onProgress === 'function') {
          onProgress(Math.max(5, Math.min(99, Math.round(progress * 100))));
        }
      };

      ffmpeg.on('progress', progressHandler);

      try {
        await ffmpeg.writeFile(inputName, sourceData);

        for (let index = 0; index < VIDEO_PROFILES.length; index += 1) {
          const profile = VIDEO_PROFILES[index];
          const totalBitrateKbps = Math.max(
            120,
            Math.floor(((MAX_VIDEO_BYTES * 8 * 0.9) / Math.max(clipDuration, 1)) / 1000)
          );
          const audioKbps = Math.min(profile.audioKbps, Math.max(0, totalBitrateKbps - 96));
          const videoKbps = Math.max(
            96,
            Math.min(profile.videoKbpsCap, totalBitrateKbps - audioKbps)
          );

          const scaled = this.getScaledDimensions(width, height, profile.width, profile.height);
          const command = [
            '-ss', String(start),
            '-t', String(clipDuration),
            '-i', inputName,
            '-map', '0:v:0',
            '-map', '0:a:0?',
            '-vf', `fps=${profile.fps},scale=${scaled.width}:${scaled.height}`,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-profile:v', 'main',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-b:v', `${videoKbps}k`,
            '-maxrate', `${Math.max(videoKbps, Math.round(videoKbps * 1.1))}k`,
            '-bufsize', `${Math.max(videoKbps * 2, 192)}k`,
            '-r', String(profile.fps),
          ];

          if (audioKbps > 0) {
            command.push('-c:a', 'aac', '-b:a', `${audioKbps}k`, '-ac', '1', '-ar', '44100');
          } else {
            command.push('-an');
          }

          command.push(outputName);

          const exitCode = await ffmpeg.exec(command, 180000);
          if (exitCode !== 0) {
            throw new Error('Video compression failed.');
          }

          const data = await ffmpeg.readFile(outputName);
          const candidate = new File([data], this.replaceExtension(file.name, 'mp4'), {
            type: 'video/mp4',
            lastModified: Date.now(),
          });
          bestFile = candidate;

          await this.safeDeleteFfmpegFile(ffmpeg, outputName);

          if (candidate.size <= MAX_VIDEO_BYTES) {
            if (typeof onProgress === 'function') {
              onProgress(100);
            }
            return {
              file: candidate,
              originalSize: file.size,
              optimizedSize: candidate.size,
              trimmedDuration: clipDuration,
              reductionPercent: this.getReductionPercent(file.size, candidate.size),
            };
          }
        }
      } finally {
        ffmpeg.off('progress', progressHandler);
        await this.safeDeleteFfmpegFile(ffmpeg, inputName);
        await this.safeDeleteFfmpegFile(ffmpeg, outputName);
      }

      if (bestFile && bestFile.size <= MAX_VIDEO_BYTES) {
        return {
          file: bestFile,
          originalSize: file.size,
          optimizedSize: bestFile.size,
          trimmedDuration: clipDuration,
          reductionPercent: this.getReductionPercent(file.size, bestFile.size),
        };
      }

      throw new Error('Video too complex. Reduce length or quality.');
    },

    async loadImageCompressionLibrary() {
      if (!this.state.imageCompressionPromise) {
        this.state.imageCompressionPromise = import(IMAGE_MODULE_URL).then((module) => module.default || module);
      }
      return this.state.imageCompressionPromise;
    },

    async loadFFmpeg() {
      if (!this.state.ffmpegPromise) {
        this.state.ffmpegPromise = Promise.all([
          import(FFMPEG_MODULE_URL),
          import(FFMPEG_UTIL_URL),
        ]).then(async ([ffmpegModule, utilModule]) => {
          const ffmpeg = new ffmpegModule.FFmpeg();
          await ffmpeg.load({
            coreURL: FFMPEG_CORE_URL,
            wasmURL: FFMPEG_WASM_URL,
          });

          return {
            ffmpeg,
            fetchFile: utilModule.fetchFile,
          };
        }).catch((error) => {
          this.state.ffmpegPromise = null;
          throw error;
        });
      }

      return this.state.ffmpegPromise;
    },

    async readVideoMetadata(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;

        video.onloadedmetadata = () => {
          const metadata = {
            duration: Number.isFinite(video.duration) ? video.duration : 0,
            width: video.videoWidth || 0,
            height: video.videoHeight || 0,
          };
          URL.revokeObjectURL(url);
          resolve(metadata);
        };

        video.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Could not read video metadata.'));
        };

        video.src = url;
      });
    },

    previewPhoto(file) {
      const url = this.createPreviewUrl('photo', file);
      this.dom.photoPreviewImg.src = url;
      this.dom.photoPreview.hidden = false;
    },

    previewCarousel(items) {
      this.dom.carouselPreview.innerHTML = '';

      items.forEach((item, index) => {
        const file = item.file || item;
        const url = URL.createObjectURL(file);
        const wrapper = document.createElement('div');
        wrapper.className = 'carousel-item';

        const image = document.createElement('img');
        image.src = url;
        image.alt = `Carousel image ${index + 1}`;

        const removeButton = document.createElement('div');
        removeButton.className = 'carousel-remove';
        removeButton.textContent = 'x';
        removeButton.addEventListener('click', () => {
          URL.revokeObjectURL(url);
          this.state.currentFiles.carousel.splice(index, 1);
          this.state.mediaInfo.carousel.splice(index, 1);
          this.previewCarousel(this.state.mediaInfo.carousel);
        });

        wrapper.appendChild(image);
        wrapper.appendChild(removeButton);
        this.dom.carouselPreview.appendChild(wrapper);
      });
    },

    previewVideo(file, options = {}) {
      const url = this.createPreviewUrl('video', file);
      this.dom.videoPreviewVid.src = url;
      this.dom.videoPreviewVid.load();
      this.dom.videoPreview.hidden = false;

      if (typeof options.loopStart === 'number' && typeof options.loopEnd === 'number') {
        this.state.videoPreviewLoop = {
          enabled: true,
          start: options.loopStart,
          end: options.loopEnd,
        };
      } else {
        this.state.videoPreviewLoop = {
          enabled: false,
          start: 0,
          end: 0,
        };
      }
    },

    removeMedia(type) {
      if (type === 'photo') {
        this.clearPhotoState();
      } else if (type === 'video') {
        this.clearVideoState();
      }
    },

    updateCharCount(inputId, countId) {
      const input = document.getElementById(inputId);
      const count = document.getElementById(countId);
      if (input && count) {
        count.textContent = String(input.value.length);
      }
    },

    async savePost(post) {
      const supabase = window.supabaseClient;
      if (!supabase) {
        throw new Error('Supabase not initialized.');
      }

      const insertPayload = {
        user_id: post.user_id,
        type: post.type,
        category: post.type === 'text' ? post.category : null,
        caption: post.caption || (post.type === 'text' ? post.content : '') || null,
        content: post.type === 'text' ? (post.content || post.caption || '') : null,
        image_url: post.type === 'image' ? (post.image_url || post.carousel_urls?.[0] || null) : null,
        media_url: post.type === 'reel' ? (post.media_url || null) : null,
      };

      const { data, error } = await supabase
        .from('posts')
        .insert([insertPayload])
        .select()
        .single();

      if (error) {
        throw error;
      }
      return data;
    },

    resetForm() {
      this.dom.form?.reset();
      if (this.dom.postContent) {
        this.dom.postContent.value = '';
      }
      if (this.dom.photoInput) {
        this.dom.photoInput.value = '';
      }
      if (this.dom.carouselInput) {
        this.dom.carouselInput.value = '';
      }
      if (this.dom.videoInput) {
        this.dom.videoInput.value = '';
      }

      this.state.currentFiles = {
        photo: null,
        carousel: [],
        video: null,
      };
      this.state.mediaInfo = {
        photo: null,
        carousel: [],
        video: null,
      };
      this.state.videoTrim = {
        duration: 0,
        width: 0,
        height: 0,
        start: 0,
        end: 0,
      };
      this.state.pendingTasks = {
        photo: this.state.pendingTasks.photo + 1,
        carousel: this.state.pendingTasks.carousel + 1,
        video: this.state.pendingTasks.video + 1,
      };
      this.state.activeOptimizations = 0;
      this.state.videoPreviewLoop = {
        enabled: false,
        start: 0,
        end: 0,
      };

      this.clearPreviewUrl('photo');
      this.clearPreviewUrl('video');

      if (this.state.videoSourceUrl) {
        URL.revokeObjectURL(this.state.videoSourceUrl);
        this.state.videoSourceUrl = '';
      }

      this.dom.photoPreview.hidden = true;
      this.dom.videoPreview.hidden = true;
      this.dom.photoPreviewImg.src = '';
      this.dom.videoPreviewVid.removeAttribute('src');
      this.dom.videoPreviewVid.load();
      this.dom.carouselPreview.innerHTML = '';

      this.dom.charCount.textContent = '0';
      this.dom.photoCaptionCount.textContent = '0';
      this.dom.carouselCaptionCount.textContent = '0';
      this.dom.videoCaptionCount.textContent = '0';

      this.setStatus('photo', '', 'info', true);
      this.setStatus('video', '', 'info', true);
      this.hideProgress();
      this.hideVideoTrimControls();
      this.selectPostType('text');
    },

    openModal() {
      if (!window.SupabaseAuth?.isAuthenticated()) {
        this.showInfo('Login to post.');
        return;
      }
      this.resetForm();
      this.dom.modal.classList.remove('hidden');
    },

    closeModal() {
      this.dom.modal.classList.add('hidden');
      this.resetForm();
    },

    showProgress(message, percent = 0) {
      this.dom.uploadProgress.hidden = false;
      this.updateProgress(percent, message);
    },

    updateProgress(percent, message) {
      if (this.dom.progressFill) {
        this.dom.progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
      }
      if (this.dom.progressText) {
        this.dom.progressText.textContent = message || `Uploading: ${Math.round(percent)}%`;
      }
    },

    hideProgress() {
      if (this.dom.uploadProgress) {
        this.dom.uploadProgress.hidden = true;
      }
      if (this.dom.progressFill) {
        this.dom.progressFill.style.width = '0%';
      }
      if (this.dom.progressText) {
        this.dom.progressText.textContent = 'Uploading: 0%';
      }
    },

    setStatus(kind, message, tone = 'info', hidden = false) {
      const element = kind === 'photo' ? this.dom.photoStatus : this.dom.videoStatus;
      if (!element) {
        return;
      }

      element.textContent = message || '';
      element.dataset.tone = tone;
      element.hidden = hidden || !message;
    },

    clearPhotoState() {
      this.bumpTask('photo');
      this.state.currentFiles.photo = null;
      this.state.mediaInfo.photo = null;
      this.clearPreviewUrl('photo');
      this.dom.photoPreview.hidden = true;
      this.dom.photoPreviewImg.src = '';
      if (this.dom.photoInput) {
        this.dom.photoInput.value = '';
      }
      this.setStatus('photo', '', 'info', true);
      this.hideProgress();
    },

    clearCarouselState() {
      this.bumpTask('carousel');
      this.state.currentFiles.carousel = [];
      this.state.mediaInfo.carousel = [];
      if (this.dom.carouselInput) {
        this.dom.carouselInput.value = '';
      }
      this.dom.carouselPreview.innerHTML = '';
      this.hideProgress();
    },

    clearVideoState() {
      this.bumpTask('video');
      this.state.currentFiles.video = null;
      this.state.mediaInfo.video = null;
      this.state.videoTrim = {
        duration: 0,
        width: 0,
        height: 0,
        start: 0,
        end: 0,
      };
      this.state.videoPreviewLoop = {
        enabled: false,
        start: 0,
        end: 0,
      };

      if (this.dom.videoInput) {
        this.dom.videoInput.value = '';
      }

      this.clearPreviewUrl('video');
      this.dom.videoPreview.hidden = true;
      this.dom.videoPreviewVid.pause();
      this.dom.videoPreviewVid.removeAttribute('src');
      this.dom.videoPreviewVid.load();

      if (this.state.videoSourceUrl) {
        URL.revokeObjectURL(this.state.videoSourceUrl);
        this.state.videoSourceUrl = '';
      }

      this.hideVideoTrimControls();
      this.setStatus('video', '', 'info', true);
      this.hideProgress();
    },

    configureVideoTrimControls(duration, end) {
      if (!this.dom.videoTrimPanel) {
        return;
      }

      this.dom.videoTrimPanel.hidden = false;
      this.dom.videoTrimStart.max = String(duration);
      this.dom.videoTrimEnd.max = String(duration);
      this.dom.videoTrimStart.value = '0';
      this.dom.videoTrimEnd.value = String(end);
      this.updateVideoTrimReadout();
    },

    hideVideoTrimControls() {
      if (!this.dom.videoTrimPanel) {
        return;
      }
      this.dom.videoTrimPanel.hidden = true;
      if (this.dom.videoTrimStart) {
        this.dom.videoTrimStart.value = '0';
      }
      if (this.dom.videoTrimEnd) {
        this.dom.videoTrimEnd.value = '0';
      }
      if (this.dom.videoTrimDuration) {
        this.dom.videoTrimDuration.textContent = '0.0s / 30s max';
      }
      if (this.dom.videoTrimStartValue) {
        this.dom.videoTrimStartValue.textContent = '0.0s';
      }
      if (this.dom.videoTrimEndValue) {
        this.dom.videoTrimEndValue.textContent = '0.0s';
      }
    },

    updateVideoTrimReadout() {
      const trim = this.state.videoTrim;
      const clipDuration = Math.max(0, trim.end - trim.start);

      if (this.dom.videoTrimStartValue) {
        this.dom.videoTrimStartValue.textContent = `${trim.start.toFixed(1)}s`;
      }
      if (this.dom.videoTrimEndValue) {
        this.dom.videoTrimEndValue.textContent = `${trim.end.toFixed(1)}s`;
      }
      if (this.dom.videoTrimDuration) {
        this.dom.videoTrimDuration.textContent = `${clipDuration.toFixed(1)}s / ${MAX_VIDEO_DURATION}s max`;
      }
    },

    createPreviewUrl(kind, file) {
      this.clearPreviewUrl(kind);
      const url = URL.createObjectURL(file);
      this.state.previewUrls[kind] = url;
      return url;
    },

    clearPreviewUrl(kind) {
      const existing = this.state.previewUrls[kind];
      if (existing) {
        URL.revokeObjectURL(existing);
      }
      this.state.previewUrls[kind] = '';
    },

    bumpTask(kind) {
      this.state.pendingTasks[kind] += 1;
      return this.state.pendingTasks[kind];
    },

    isTaskCurrent(kind, taskId) {
      return this.state.pendingTasks[kind] === taskId;
    },

    hasActiveOptimization() {
      return this.state.activeOptimizations > 0;
    },

    startOptimization() {
      this.state.activeOptimizations += 1;
    },

    finishOptimization() {
      this.state.activeOptimizations = Math.max(0, this.state.activeOptimizations - 1);
    },

    getScaledDimensions(sourceWidth, sourceHeight, maxWidth, maxHeight) {
      if (!sourceWidth || !sourceHeight) {
        return {
          width: maxWidth,
          height: maxHeight,
        };
      }

      const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
      const width = Math.max(2, Math.floor((sourceWidth * scale) / 2) * 2);
      const height = Math.max(2, Math.floor((sourceHeight * scale) / 2) * 2);
      return { width, height };
    },

    getReductionPercent(originalBytes, optimizedBytes) {
      if (!originalBytes || optimizedBytes >= originalBytes) {
        return 0;
      }
      return Math.max(0, Math.round(((originalBytes - optimizedBytes) / originalBytes) * 100));
    },

    getExtensionFromMime(mimeType, fallback) {
      if (!mimeType) {
        return fallback;
      }
      if (mimeType.includes('jpeg')) {
        return 'jpg';
      }
      if (mimeType.includes('png')) {
        return 'png';
      }
      if (mimeType.includes('webp')) {
        return 'webp';
      }
      if (mimeType.includes('gif')) {
        return 'gif';
      }
      if (mimeType.includes('mp4')) {
        return 'mp4';
      }
      return fallback;
    },

    replaceExtension(filename, nextExtension) {
      const baseName = (filename || 'media').replace(/\.[^.]+$/, '');
      return `${baseName}.${nextExtension}`;
    },

    asFile(blob, name, mimeType) {
      if (blob instanceof File && blob.name === name && blob.type === mimeType) {
        return blob;
      }
      return new File([blob], name, {
        type: mimeType || blob.type || 'application/octet-stream',
        lastModified: Date.now(),
      });
    },

    async safeDeleteFfmpegFile(ffmpeg, filename) {
      if (!ffmpeg || !filename) {
        return;
      }
      try {
        await ffmpeg.deleteFile(filename);
      } catch (_) {
        // Ignore missing temp files.
      }
    },

    showError(message) {
      if (window.showToast) {
        window.showToast(message, 'error');
      } else {
        alert(message);
      }
    },

    showSuccess(message) {
      if (window.showToast) {
        window.showToast(message, 'success');
      }
    },

    showInfo(message) {
      if (window.showToast) {
        window.showToast(message, 'info');
      }
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PostCreator.init());
  } else {
    PostCreator.init();
  }

  window.PostCreator = PostCreator;
})();
