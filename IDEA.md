A home server for backup (Drive + Photos style).

Stack:
- apps/server — admin console (Better Auth, users/files/logs CRUD)
- packages/db — Prisma + Postgres
- packages/auth — shared Better Auth (Next + Expo-ready)
- packages/ui — shared shadcn UI
- Docker: postgres (persistent volume) + server (HOST_STORAGE_PATH mount)
- run.bat / run.sh — one-shot start with health checks

Client apps (Expo / Tauri / web) use regular user accounts later for backups.
