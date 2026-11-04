# fleet_control

Fleet Mission Control — навчальний проєкт: веб-дашборд для керування флотом БПЛА в реальному часі.
Фронтенд (React + TypeScript + Vite) підключається до бекенд-симулятора (Node + TypeScript + `ws`).

Монорепо керується Nx. Залежності — в одному `package.json` у корені.

## Вимоги

- Node.js 20+ (перевірено на 24)
- npm

## Встановлення

```bash
npm install
```

## Запуск

```bash
npm run dev            # фронтенд (http://localhost:5173) і бекенд (ws://localhost:8080) разом
npm run dev:frontend   # лише фронтенд
npm run dev:backend    # лише бекенд
```

Vite проксує `/ws` на `ws://localhost:8080`, тож фронтенд працює з бекендом без додаткової конфігурації.

## Збірка та запуск зібраного бекенду

```bash
npm run build          # збірка всіх проєктів
npm start              # запуск зібраного бекенду (потрібна збірка)
```

## Тести та перевірка типів

```bash
npm test               # тести всіх проєктів
npm run test:frontend  # лише фронтенд
npm run test:backend   # лише бекенд
npm run typecheck      # перевірка типів усіх проєктів
```

Один тестовий файл:

```bash
npx nx run backend:test -- src/server.test.ts
```

## Структура

- `frontend/` — Vite + React + TypeScript застосунок
- `backend/` — WebSocket-сервер і симулятор дронів
- `tasks/` — ТЗ та нотатки (локально, не в git)
- `nx.json`, `frontend/project.json`, `backend/project.json` — конфігурація Nx

## Ліцензія

MIT, див. [LICENSE](LICENSE).
