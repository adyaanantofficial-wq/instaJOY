/**
 * Post Creation System for instaJOY
 * Handles creating posts with images, videos, text, etc.
 */

(function initPostCreation() {
  const config = window.INSTAJOY_CONFIG || {};
  const MAX_IMAGE_BYTES = 200 * 1024;
  const MAX_VIDEO_BYTES = 1024 * 1024;
  const MAX_VIDEO_DURATION = 30;
  const MAX_CAROUSEL_PHOTOS = 10;

  const PostCreator = {
    state: {
      postType: 'text',
      currentFiles: {
        photo: null,
        carousel: [],
        video: null
      },
      isSubmitting: false
    },

    dom: {},

    init() {
      this.cacheDom();
      this.setupEventListeners();
      this.selectPostType(this.state.postType);
    },

    cacheDom() {
      this.dom = {
        modal: document.getElementById('createModal'),
        closeBtn: document.querySelector('.modal-close'),
        form: document.getElementById('createForm'),
        submitBtn: document.getElementById('createSubmit'),
        cancelBtn: document.getElementById('createCancel'),
        
        // Type selector
        typeOptions: document.querySelectorAll('.type-option'),
        
        // Text fields
        postCategory: document.getElementById('postCategory'),
        postContent: document.getElementById('postContent'),
        charCount: document.getElementById('charCount'),
        
        // Photo fields
        photoInput: document.getElementById('photoInput'),
        photoSection: document.getElementById('photoSection'),
        photoPreview: document.getElementById('photoPreview'),
        photoPreviewImg: document.getElementById('photoPreviewImg'),
        photoCaption: document.getElementById('photoCaption'),
        photoCaptionCount: document.getElementById('photoCaptionCount'),
        
        // Carousel fields
        carouselInput: document.getElementById('carouselInput'),
        carouselSection: document.getElementById('carouselSection'),
        carouselPreview: document.getElementById('carouselPreview'),
        carouselCaption: document.getElementById('carouselCaption'),
        carouselCaptionCount: document.getElementById('carouselCaptionCount'),
        
        // Video fields
        videoInput: document.getElementById('videoInput'),
        videoSection: document.getElementById('videoSection'),
        videoPreview: document.getElementById('videoPreview'),
        videoPreviewVid: document.getElementById('videoPreviewVid'),
        videoCaption: document.getElementById('videoCaption'),
        videoCaptionCount: document.getElementById('videoCaptionCount'),
        
        // Common fields
        hashtags: document.getElementById('hashtags'),
        location: document.getElementById('location'),
        privacy: document.getElementById('privacy'),
        allowComments: document.getElementById('allowComments'),
        allowLikes: document.getElementById('allowLikes'),
        
        // Progress
        uploadProgress: document.getElementById('uploadProgress'),
        progressFill: document.getElementById('progressFill'),
        progressText: document.getElementById('progressText'),
        
        // Common section
        commonFields: document.getElementById('commonFields'),
        textSection: document.getElementById('textSection')
      };
    },

    setupEventListeners() {
      // Modal controls
      this.dom.closeBtn?.addEventListener('click', () => this.closeModal());
      this.dom.cancelBtn?.addEventListener('click', () => this.closeModal());
      this.dom.modal?.addEventListener('click', (e) => {
        if (e.target === this.dom.modal) this.closeModal();
      });

      // Type selector
      this.dom.typeOptions.forEach(option => {
        option.addEventListener('click', () => this.selectPostType(option.dataset.type));
      });

      // File inputs
      this.dom.photoInput?.addEventListener('change', (e) => this.handlePhotoSelect(e));
      this.dom.carouselInput?.addEventListener('change', (e) => this.handleCarouselSelect(e));
      this.dom.videoInput?.addEventListener('change', (e) => this.handleVideoSelect(e));

      // Form submission
      this.dom.form?.addEventListener('submit', (e) => this.handleSubmit(e));

      // Character counters
      this.dom.postContent?.addEventListener('input', () => this.updateCharCount('postContent', 'charCount'));
      this.dom.photoCaption?.addEventListener('input', () => this.updateCharCount('photoCaption', 'photoCaptionCount'));
      this.dom.carouselCaption?.addEventListener('input', () => this.updateCharCount('carouselCaption', 'carouselCaptionCount'));
      this.dom.videoCaption?.addEventListener('input', () => this.updateCharCount('videoCaption', 'videoCaptionCount'));

      // Remove media buttons
      document.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-media')) {
          e.preventDefault();
          const target = e.target.dataset.target;
          this.removeMedia(target);
        }
      });

      // Expose open function
      window.openCreatePostModal = () => this.openModal();
    },

    selectPostType(type) {
      this.state.postType = type;

      // Update UI
      this.dom.typeOptions.forEach(opt => {
        opt.classList.toggle('active', opt.dataset.type === type);
      });

      // Show/hide sections
      const sectionMap = {
        text: this.dom.textSection,
        photo: this.dom.photoSection,
        carousel: this.dom.carouselSection,
        video: this.dom.videoSection,
      };

      Object.entries(sectionMap).forEach(([key, section]) => {
        if (!section) return;
        const isActive = key === type;
        section.classList.toggle('active', isActive);
        section.hidden = !isActive;
      });
    },

    handlePhotoSelect(e) {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate
      if (!file.type.startsWith('image/')) {
        this.showError('Please select an image file');
        return;
      }

      if (file.size > MAX_IMAGE_BYTES) {
        this.showError(`Image must be less than ${MAX_IMAGE_BYTES / 1024 / 1024}MB`);
        return;
      }

      this.state.currentFiles.photo = file;
      this.previewPhoto(file);
    },

    previewPhoto(file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.dom.photoPreviewImg.src = e.target.result;
        this.dom.photoPreview.hidden = false;
      };
      reader.readAsDataURL(file);
    },

    handleCarouselSelect(e) {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      // Validate
      if (files.length > MAX_CAROUSEL_PHOTOS) {
        this.showError(`Maximum ${MAX_CAROUSEL_PHOTOS} photos allowed`);
        return;
      }

      files.forEach(file => {
        if (!file.type.startsWith('image/')) {
          this.showError('All files must be images');
          return;
        }

        if (file.size > MAX_IMAGE_BYTES) {
          this.showError(`Image must be less than ${MAX_IMAGE_BYTES / 1024 / 1024}MB`);
          return;
        }
      });

      this.state.currentFiles.carousel = files;
      this.previewCarousel(files);
    },

    previewCarousel(files) {
      this.dom.carouselPreview.innerHTML = '';
      files.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const div = document.createElement('div');
          div.className = 'carousel-item';
          div.innerHTML = `
            <img src="${e.target.result}" alt="Carousel image ${index + 1}">
            <div class="carousel-remove" data-index="${index}">✕</div>
          `;
          div.querySelector('.carousel-remove').addEventListener('click', () => {
            this.state.currentFiles.carousel.splice(index, 1);
            this.previewCarousel(this.state.currentFiles.carousel);
          });
          this.dom.carouselPreview.appendChild(div);
        };
        reader.readAsDataURL(file);
      });
    },

    async handleVideoSelect(e) {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate
      if (!file.type.startsWith('video/')) {
        this.showError('Please select a video file');
        return;
      }

      if (file.size > MAX_VIDEO_BYTES) {
        this.showError(`Video must be less than ${MAX_VIDEO_BYTES / 1024 / 1024}MB`);
        return;
      }

      // Check duration
      const video = document.createElement('video');
      video.onloadedmetadata = () => {
        if (video.duration > MAX_VIDEO_DURATION) {
          this.showError(`Video must be ${MAX_VIDEO_DURATION} seconds or less`);
          return;
        }
        this.state.currentFiles.video = file;
        this.previewVideo(file);
      };
      video.src = URL.createObjectURL(file);
    },

    previewVideo(file) {
      const url = URL.createObjectURL(file);
      this.dom.videoPreviewVid.src = url;
      this.dom.videoPreview.hidden = false;
    },

    removeMedia(type) {
      if (type === 'photo') {
        this.state.currentFiles.photo = null;
        this.dom.photoInput.value = '';
        this.dom.photoPreview.hidden = true;
      } else if (type === 'video') {
        this.state.currentFiles.video = null;
        this.dom.videoInput.value = '';
        this.dom.videoPreview.hidden = true;
      }
    },

    updateCharCount(inputId, countId) {
      const input = document.getElementById(inputId);
      const count = document.getElementById(countId);
      if (input && count) {
        count.textContent = input.value.length;
      }
    },

    async handleSubmit(e) {
      e.preventDefault();

      if (this.state.isSubmitting) return;
      this.state.isSubmitting = true;
      this.dom.submitBtn.disabled = true;

      try {
        // Validate post content
        if (!this.validatePost()) {
          return;
        }

        // Create post object
        const post = this.buildPostObject();

        // Upload media if present
        if (this.state.currentFiles.photo || this.state.currentFiles.video || this.state.currentFiles.carousel.length > 0) {
          await this.uploadMedia(post);
        }

        // Save post to Supabase
        await this.savePost(post);

        // Success
        this.showSuccess('Post published!');
        this.closeModal();
        this.resetForm();

        // Trigger feed update
        if (window.app && typeof window.app.loadHomeFeed === 'function') {
          await window.app.loadHomeFeed(true);
        }
        if (window.app && typeof window.app.loadReels === 'function') {
          await window.app.loadReels(true);
        }
      } catch (error) {
        this.showError(error.message || 'Failed to publish post');
      } finally {
        this.state.isSubmitting = false;
        this.dom.submitBtn.disabled = false;
      }
    },

    validatePost() {
      const type = this.state.postType;

      if (type === 'text') {
        const content = this.dom.postContent.value.trim();
        if (!content) {
          this.showError('Please write something');
          return false;
        }
      } else if (type === 'photo') {
        if (!this.state.currentFiles.photo) {
          this.showError('Please select a photo');
          return false;
        }
      } else if (type === 'carousel') {
        if (this.state.currentFiles.carousel.length === 0) {
          this.showError('Please select at least one photo');
          return false;
        }
      } else if (type === 'video') {
        if (!this.state.currentFiles.video) {
          this.showError('Please select a video');
          return false;
        }
      }

      return true;
    },

    buildPostObject() {
      const user = window.SupabaseAuth?.getUser() || { id: 'guest' };
      const selectedType = this.state.postType;
      const type = selectedType === 'video' ? 'reel' : selectedType === 'text' ? 'text' : 'image';

      const post = {
        user_id: user.id,
        type: type,
        category: type === 'text' ? (this.dom.postCategory?.value || null) : null,
        caption: this.getCaption(),
        content: type === 'text' ? this.dom.postContent.value.trim() : null
      };

      return post;
    },

    getCaption() {
      const type = this.state.postType;
      if (type === 'photo') return this.dom.photoCaption?.value || '';
      if (type === 'carousel') return this.dom.carouselCaption?.value || '';
      if (type === 'video') return this.dom.videoCaption?.value || '';
      return '';
    },

    async uploadMedia(post) {
      const supabase = window.supabaseClient;
      if (!supabase) throw new Error('Supabase not initialized');

      this.dom.uploadProgress.hidden = false;

      // Upload based on type
      if (this.state.postType === 'photo' && this.state.currentFiles.photo) {
        const urls = await this.uploadPhotos([this.state.currentFiles.photo]);
        post.image_url = urls[0];
      } else if (this.state.postType === 'carousel' && this.state.currentFiles.carousel.length > 0) {
        const urls = await this.uploadPhotos(this.state.currentFiles.carousel);
        post.carousel_urls = urls;
        post.image_url = urls[0] || null;
      } else if (this.state.postType === 'video' && this.state.currentFiles.video) {
        const url = await this.uploadVideo(this.state.currentFiles.video);
        post.media_url = url;
      }

      this.dom.uploadProgress.hidden = true;
    },

    async uploadPhotos(files) {
      const supabase = window.supabaseClient;
      const user = window.SupabaseAuth?.getUser();
      const urls = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const path = `${user?.id}/posts/${Date.now()}_${i}.jpg`;

        // Compress image
        const compressed = await this.compressImage(file);

        const { data, error } = await supabase.storage
          .from('post-images')
          .upload(path, compressed, { upsert: true });

        if (error) throw error;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('post-images')
          .getPublicUrl(path);

        urls.push(publicUrl);

        // Update progress
        const progress = ((i + 1) / files.length) * 100;
        this.updateProgress(progress);
      }

      return urls;
    },

    async uploadVideo(file) {
      const supabase = window.supabaseClient;
      const user = window.SupabaseAuth?.getUser();
      const path = `${user?.id}/reels/${Date.now()}.mp4`;

      const { data, error } = await supabase.storage
        .from('reel-videos')
        .upload(path, file, { upsert: true });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('reel-videos')
        .getPublicUrl(path);

      this.updateProgress(100);
      return publicUrl;
    },

    async compressImage(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Scale down if necessary
            if (width > 1200) {
              height = (height * 1200) / width;
              width = 1200;
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
              resolve(blob || file);
            }, 'image/jpeg', 0.85);
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
    },

    updateProgress(percent) {
      this.dom.progressFill.style.width = `${percent}%`;
      this.dom.progressText.textContent = `Uploading: ${Math.round(percent)}%`;
    },

    async savePost(post) {
      const supabase = window.supabaseClient;
      if (!supabase) throw new Error('Supabase not initialized');

      // Guest posts are local-only
      if (post.user_id === 'guest') {
        // Store in localStorage for guest users
        const guestPosts = JSON.parse(localStorage.getItem('instajoy_guest_posts') || '[]');
        guestPosts.unshift({ ...post, id: `guest_${Date.now()}` });
        localStorage.setItem('instajoy_guest_posts', JSON.stringify(guestPosts));
        return;
      }

      // Save authenticated posts to Supabase
      const insertPayload = {
        user_id: post.user_id,
        type: post.type,
        category: post.type === 'text' ? post.category : null,
        caption: post.caption || (post.type === 'text' ? post.content : '') || null,
        content: post.type === 'text' ? (post.content || post.caption || '') : null,
        image_url: post.type === 'image' ? (post.image_url || post.carousel_urls?.[0] || null) : null,
        media_url: post.type === 'reel' ? (post.media_url || null) : null
      };

      const { data, error } = await supabase
        .from('posts')
        .insert([insertPayload])
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    resetForm() {
      this.dom.form?.reset();
      this.dom.postContent.value = '';
      this.dom.photoInput.value = '';
      this.dom.carouselInput.value = '';
      this.dom.videoInput.value = '';
      this.dom.photoPreview.hidden = true;
      this.dom.videoPreview.hidden = true;
      this.dom.charCount.textContent = '0';
      this.state.currentFiles = { photo: null, carousel: [], video: null };
      this.selectPostType('text');
    },

    openModal() {
      if (window.SupabaseAuth?.isGuestMode()) {
        this.showInfo('Login to post. Guest mode is view-only.');
        return;
      }
      this.resetForm();
      this.dom.modal.classList.remove('hidden');
    },

    closeModal() {
      this.dom.modal.classList.add('hidden');
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
    }
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PostCreator.init());
  } else {
    PostCreator.init();
  }

  // Export for testing
  window.PostCreator = PostCreator;

})();
