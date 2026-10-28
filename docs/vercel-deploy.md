# Vercel 배포 가이드 (카카오 길찾기 · OR-Tools 없음)

경로 계산은 Next 서버에서 카카오 자동차 길찾기 API만 호출합니다.  
Python 솔버(`solver/`, `ROUTE_SOLVER_URL`)는 배포에 필요 없습니다.

---

## 0. 전제

- GitHub(또는 Git)에 코드가 올라가 있을 것
- 카카오 디벨로퍼스 앱에 **JavaScript 키** + **REST API 키**가 있을 것
- 배지: `카카오맵 무료 쿼터`면 결제 없이 무료 한도 사용

로컬 `.env` 예시:

```env
DATABASE_URL="file:./dev.db"
NEXT_PUBLIC_KAKAO_MAP_KEY=...   # JavaScript 키
KAKAO_REST_API_KEY=...          # REST 키 (주소검색·길찾기)
```

---

## 1. DB: Vercel에서는 SQLite 파일 사용 불가

서버리스라 `file:./dev.db`는 持久화되지 않습니다.  
**Neon(Postgres) 무료**를 권장합니다.

### 1-1. Neon 만들기

1. https://neon.tech 가입
2. Create Project
3. Connection string 복사  
   예: `postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`

### 1-2. Prisma (이미 postgresql)

저장소 `prisma/schema.prisma` 는 `provider = "postgresql"` 입니다.

```bash
# .env 의 DATABASE_URL 을 Neon URL 로 바꾼 뒤
npx prisma db push
npx tsx prisma/seed.ts
```

Vercel 빌드(`npm run build`)도 같은 URL로 `db push` + `seed` 를 실행합니다.

---

## 2. Vercel 프로젝트 연결

1. https://vercel.com 로그인
2. **Add New → Project** → GitHub 저장소 선택
3. Framework: Next.js (자동 감지)
4. Root Directory: 저장소 루트
5. Build Command: `npm run build` (기본)
6. Install Command: `npm install`

---

## 3. 환경 변수 (Vercel → Project → Settings → Environment Variables)

| Name | 값 | 환경 |
|------|-----|------|
| `DATABASE_URL` | Neon Postgres URL | Production, Preview |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 카카오 **JavaScript** 키 | Production, Preview |
| `KAKAO_REST_API_KEY` | 카카오 **REST** 키 | Production, Preview |

넣지 않는 것:

- `ROUTE_SOLVER_URL` (더 이상 사용 안 함)
- `DATABASE_URL=file:./dev.db` (Vercel에서 금지)

저장 후 **Redeploy**.

---

## 4. 카카오 플랫폼 설정

카카오 디벨로퍼스 → 앱 → 플랫폼:

1. **Web** 사이트 도메인에 Vercel 도메인 추가  
   예: `https://your-app.vercel.app`
2. JavaScript 키 사용 시 도메인 제한이 있으면 동일 등록
3. REST 키로 길찾기·주소검색 호출 (서버)

---

## 5. 배포 확인 체크리스트

1. 홈 `/` 로드, 일정 보이는지
2. 새 납품 등록 → 추천 동작
3. 지도 `/map` → **경로 계산** → `카카오 자동차 길찾기 · API N회 · OR-Tools 미사용`
4. 마커·도로 선 표시

문제 시:

| 증상 | 확인 |
|------|------|
| Prisma / DB 오류 | `DATABASE_URL`, `provider = postgresql`, `db push` |
| 지도 안 뜸 | `NEXT_PUBLIC_KAKAO_MAP_KEY`, Web 도메인 |
| 경로 폴백(직선) | `KAKAO_REST_API_KEY`, 내비 길찾기 쿼터 |
| 빌드 실패 | Vercel 빌드 로그의 `prisma generate` / seed |

---

## 6. 로컬 개발 (OR-Tools 없이)

```bash
npm install
npx prisma db push
npx tsx prisma/seed.ts
npm run dev
```

`npm run solver:dev` 는 실행하지 않아도 됩니다.

---

## 7. 이후 할 일 (배포 후)

- 차량별 **방문 순서 수동 변경** UI (식사·입고 사정)
- 순서 변경 후 카카오 경로 재계산
- (선택) Postgres 마이그레이션을 로컬 기본으로 통일
