const { startServer, shutdown } = require('./backend/server');

startServer().catch(async (error) => {
    console.error('Failed to start server:', error.message);
    await shutdown();
    process.exit(1);
});

['SIGINT', 'SIGTERM'].forEach((signal) => {
    process.on(signal, async () => {
        await shutdown(signal);
        process.exit(0);
    });
});
