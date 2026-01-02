module.exports = {
  apps: [
    {
      name: "r2-gallery",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3423",
      cwd: "./",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3423,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3423,
      },
      // Logging
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_file: "./logs/pm2-combined.log",
      time: true,
      // Graceful restart
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};
