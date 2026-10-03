<div align="center">
  <img src="public/favicon.svg" width="72" alt="작은숨" />
  <h1>작은숨 · Little Breath</h1>
  <p><strong>A little life, drawn by you.</strong><br>당신의 선으로 태어나, 함께한 시간으로 자라는 작은 친구.</p>
</div>

A privacy-first living sketchbook. Draw a creature, give it an editable skeleton, and care for it in a small changing world. Built with TypeScript and Canvas 2D, with no browser runtime dependencies.

## 무엇을 할 수 있나요?

- **직접 그리기**: 펜·색상·두께·획 지우개·실행 취소/다시 실행, 터치와 펜 입력
- **사진 따라 그리기**: PNG/JPEG/WebP를 로컬 밑그림으로 불러오고 투명도·크기·위치 조절. 원본 사진은 저장/전송/프로젝트 내보내기에 포함되지 않음
- **이름과 탄생 이야기**: 정확한 생일 또는 대략적인 계절, 도시, 이름. 계절별 성격은 상상으로 만든 설정이며 실제 과거 날씨 추정이 아님
- **관절 편집**: 몸·머리 중심, 최대 8개 다리, 각 다리 2–4개 관절. 좌표 입력과 키보드 이동, 드래그, 관절 추가/삭제, 끝점 연결, 실행 취소
- **네발 친구**: 예시 토리의 네 다리와 대각선 보행. 다리 수와 관절 수는 별개이며 관절 추가 시 순서 있는 연결선 유지
- **원본 그림의 변형**: 절차적 행동 + 역기구학(IK) + 가중치 기반 스키닝. 그린 획만 변형하고 숨겨진 다리를 만들지 않음
- **끌어 놓는 돌봄 서랍**: 정원 옆 탭을 열어 씨앗·산딸기·당근·물을 원하는 위치로 드래그. 마우스·터치 지원, 실제 놓일 바닥 위치 미리보기. 선택 후 정원 누르기 또는 방향키·Enter 배치, Esc 취소
- **돌봄과 성장**: 씨앗·산딸기·당근, 물, 쓰다듬기, 따라오기, 휴식. 실제 도착/섭취 이후 성장 XP와 먹이 기록, 4단계 크기 변화. 방치로 인한 벌점 없음
- **작은 정원**: 맑음·구름·비·눈·천둥·안개 × 낮/밤, 정원 PNG 저장, 관절 시각화, 움직임 줄이기
- **저장/교환**: 브라우저 로컬 저장, 버전 관리 JSON 프로젝트 내보내기·검증된 가져오기
- **선택적 계정 동기화**: GitHub 로그인 후 직접 동의하고 켜는 Supabase 저장. 기기별 충돌 확인·두 사본 보관·오프라인 재시도, 게스트 사본 유지
- **날씨**: 완전한 Mock 기본 모드, 선택적으로 서버를 통한 현재 OpenWeather 연동

## 빠른 시작

Node.js **22.12 이상** (CI: Node 22/24).

```bash
npm ci
npm run dev
```

표시된 `http://127.0.0.1:5173`을 여세요. API 키나 계정 없이 모든 창작·정원 기능이 동작합니다.

```bash
npm run check       # 단위/통합 테스트 + 서버 타입 검사 + 프런트 타입 검사/빌드
npm run test:e2e    # Chromium 브라우저 회귀 테스트
npm run build      # dist/ 정적 배포 산출물
npm run preview    # 로컬 빌드 미리보기 (운영 서버 용도 아님)
```

브라우저 테스트를 처음 실행한다면 `npx playwright install chromium`을 먼저 실행합니다.

## GitHub Pages 배포

`.github/workflows/pages.yml`은 main 브랜치 push 또는 수동 실행 시 정적 앱을 빌드·배포합니다.

1. 저장소 Settings → Pages → Source를 **GitHub Actions**로 선택
2. main 브랜치로 push하거나 **Deploy GitHub Pages** 워크플로 수동 실행
3. 작업 결과에 표시되는 Pages URL 열기

상대 자산 경로와 해시 내비게이션을 사용하므로 `/repository-name/` 아래에서도 동작합니다. 별도 커스텀 도메인은 필요 없습니다.

**GitHub Pages는 서버를 실행하지 않습니다.** Pages에서는 키 없는 Mock 경험 전체를 제공합니다. 실제 OpenWeather는 아래 선택적 서버가 필요합니다. 브라우저 번들/저장소/GitHub Actions에 API 키를 넣지 마세요.

## 선택적 계정 동기화

상단 구름 버튼에서 GitHub로 로그인한 뒤, 전송할 정보와 Supabase(서울) 저장소 안내를 확인하고 동기화를 켜세요. 로그인만으로 그림을 업로드하지 않아요. 다른 기기의 사본과 다르면 직접 고를 수 있으며 두 사본을 보관합니다. 새로고침 후에는 동기화를 다시 켜야 대기 중인 저장이 이어져요. 사진 밑그림과 날씨 데이터는 동기화하지 않습니다.

GitHub Pages에서도 동작합니다. 자신의 포크에 연결할 때는 [설정·동시 편집·복구 안내](docs/cloud-sync.md)를 따르세요. Supabase publishable 키만 브라우저에 사용하며 GitHub client secret이나 서버 키는 절대 넣지 마세요.

## 선택적 실제 날씨 서버

```bash
cp .env.example .env
# .env의 OPENWEATHER_API_KEY를 본인의 키로 설정
npm run build
npm run server
```

`http://127.0.0.1:8787`에서 앱과 API가 같은 출처로 제공됩니다. 앱의 **날씨 연결 설정 → 실제 날씨 불러오기**를 눌렀을 때만 통신합니다.

- 생일, 이름, 그림, 사진은 서버에 보내지 않음
- 선택 도시의 고정 좌표만 사용. 임의 URL 프록시 없음
- 서버 키, 타임아웃, 응답 크기 제한, 제한된 캐시, IP별 제한, 안전한 오류, 정적 파일 경로 검증
- 개발 시 Vite는 `/api`를 로컬 8787 서버로 연결
- 공개 운영은 HTTPS, 호스팅 접근 로그/보존 정책, 제공자 요금·약관, 분산 rate limit을 별도 검토

설정과 제한: [docs/weather.md](docs/weather.md). 제공자: [OpenWeather](https://openweathermap.org/), [귀속/라이선스 안내](docs/THIRD_PARTY_NOTICES.md).

## 움직임에 대한 약속

이 프로젝트는 **임의의 그림을 제어하는 사전학습 AI**나 완전한 물리 엔진이 아닙니다. 보행 목표를 절차적으로 만들고, 2–4개 관절의 연결 사슬을 IK로 풀고, 가까운 뼈의 변환을 그림의 획에 가중 합성합니다. 신경망 가중치는 배포하지 않습니다.

몸이 심하게 겹치거나 다리가 교차하는 특이한 그림은 스키닝이 왜곡될 수 있습니다. 관절 위치와 선을 수정해 보세요. 자동 배경 제거·사진의 자동 펫 변환·충돌 물리·강화학습 훈련은 현재 범위에 없습니다.

## 프라이버시

- 계정은 선택 사항이며 광고·분석 SDK·자동 위치 권한 요청은 없음
- 새 설치의 첫 화면은 외부 API를 호출하지 않음
- 기본 프로젝트와 계정별 로컬 사본은 `localStorage`에 보관. 동기화를 직접 켜면 허용된 프로젝트 필드만 Supabase의 본인 계정 행에 저장. 민감한 데이터를 위한 암호화 저장소가 아니므로 공용 기기에서는 주의
- 내보낸 JSON에는 사용자가 입력한 이름/생일/도시/그림이 포함됨. 공개 공유 전에 확인
- 사진 밑그림은 메모리에만 존재하고 작업실을 나가거나 제거/교체할 때 해제
- 브라우저 데이터 삭제 시 프로젝트가 사라질 수 있으므로 파일로 백업 권장

## 구조

```text
src/
  main.ts              UI, 창작 흐름, 포인터/키보드, 로컬 상태 연결
  project.ts           버전 1 포맷, 제한된 import, 로컬 저장, 이력
  cloud/               선택적 PKCE 로그인, 계정별 저장·충돌 복구 UI
  growth.ts            순수 성장 단계/먹이 보상 함수
  care-tray.ts         접이식 돌봄 서랍, 포인터/키보드 배치
  care-placement.ts    미리보기와 실제 놓기의 공통 좌표·제스처 규칙
  tracing.ts           로컬 래스터 밑그림 수명 관리
  scene.ts             원본 Canvas 정원/날씨 장면
  weather.ts           Mock 및 동일 출처 날씨 클라이언트
  engine/              IK, 행동, 포즈, 스키닝, 렌더링
server/                 선택적 OpenWeather 프록시/정적 서버
public/                 원본 아이콘 및 제공자 귀속 자산
tests/                  단위, 통합, 브라우저 회귀
```

[아키텍처](docs/architecture.md) · [보안 정책](SECURITY.md) · [기여 안내](CONTRIBUTING.md) · [릴리스 검토](docs/release-review.md)

## License

Original code and artwork: MIT. Provider data, third-party dependencies, and the OpenWeather trademark/logo retain their respective terms. See [LICENSE](LICENSE) and [third-party notices](docs/THIRD_PARTY_NOTICES.md).
