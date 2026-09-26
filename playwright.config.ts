// Phase 4 M3 PR B — chromium 단일 브라우저, dev server 자동 기동
import { defineConfig } from '@playwright/test'

// 게이트 전용 포트. 떠 있는 서버를 재사용하지 않는다: 개발 서버(3000)나 다른 worktree가 띄운
// 서버를 재사용하면 남의 빌드·env를 감사하고 초록을 낸다(점유 중이면 크게 실패한다).
const PORT = 3100

export default defineConfig({
  testDir: './tests/a11y',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 180_000,
    reuseExistingServer: false,
  },
})
