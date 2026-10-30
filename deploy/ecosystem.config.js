// ==============================================================================
// PM2 Ecosystem Configuration for LabelFlow
// Manages both FastAPI (Python) and Next.js (Node) processes with auto-restart
// ==============================================================================

module.exports = {
  apps: [
    {
      name: "labelflow-backend",
      cwd: "./backend",
      script: "python3",
      args: "-m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 4",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        ENVIRONMENT: "production",
        DEBUG: "false",
        AUTH_COOKIE_SECURE: "true",
      },
      error_file: "./logs/backend-error.log",
      out_file: "./logs/backend-out.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "labelflow-frontend",
      cwd: "./frontend",
      script: "npm",
      args: "start",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      error_file: "./logs/frontend-error.log",
      out_file: "./logs/frontend-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
