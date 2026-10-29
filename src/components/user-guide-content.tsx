export const USER_GUIDE_SECTIONS = [
  {
    id: "summary",
    title: "1. 간단 요약",
    body: (
      <>
        <p>
          이 화면은 <strong>네오마그네틱 당일 납품을 차량에 나누고</strong>, 지도에서
          방문 순서를 정하기 위한 도구입니다.
        </p>
        <ol>
          <li>
            <strong>일정 · 배차</strong>에서 오늘 납품을 등록하고, 추천된 차량을 확인한 뒤
            확정합니다.
          </li>
          <li>
            <strong>경로 · 지도</strong>에서 차량별 길을 그리고, 방문 순서를 조정합니다.
          </li>
          <li>
            납품이 끝나면 보드에서 <strong>완료</strong>로 옮깁니다.
          </li>
        </ol>
        <p>
          처음이라면 아래 목차 순서대로 따라가면 됩니다. 막히면 이 설명서를 다시 열어
          해당 번호를 찾으세요.
        </p>
      </>
    ),
  },
  {
    id: "menu",
    title: "2. 화면·메뉴 한눈에 보기",
    body: (
      <>
        <p>맨 위 메뉴는 이렇게 나뉩니다.</p>
        <ul>
          <li>
            <strong>일정 · 배차</strong> — 오늘(또는 선택한 날) 납품 목록과 차량 추천·확정
          </li>
          <li>
            <strong>경로 · 지도</strong> — 지도에 납품지를 찍고 카카오로 도로 경로 계산
          </li>
          <li>
            <strong>설정</strong>
            <ul>
              <li>
                <strong>처음 가져오기</strong> — 엑셀 등 초기 데이터 불러오기
              </li>
              <li>
                <strong>차량</strong> — 1호·2호·3호·스타리아 등 차량 정보
              </li>
              <li>
                <strong>지역</strong> — 납품 지역(수도권/지방 등) 기준
              </li>
            </ul>
          </li>
        </ul>
        <p>
          왼쪽 로고(<strong>Dispatch System</strong>)를 누르면 항상 일정 · 배차 홈으로
          돌아갑니다.
        </p>
      </>
    ),
  },
  {
    id: "board",
    title: "3. 일정 · 배차 (기본 화면)",
    body: (
      <>
        <p>
          홈은 <strong>칸반 보드</strong>입니다. 카드가 왼쪽에서 오른쪽으로 진행됩니다.
        </p>
        <ul>
          <li>
            <strong>추천 확인</strong> — 새로 등록됐거나 아직 확정 전인 건
          </li>
          <li>
            <strong>배차 확정</strong> — 오늘 그 차로 가기로 확정한 건
          </li>
          <li>
            <strong>납품 완료</strong> — 처리가 끝난 건
          </li>
        </ul>
        <p>
          위쪽 <strong>납품일</strong>로 날짜를 바꿀 수 있습니다. 과거 날짜를 고르면 그날
          일정이 다시 보입니다.
        </p>
        <p>
          오른쪽 요약(전체·확정·완료)과 아래 <strong>잔여 PLT · 차량</strong>으로 1호·2호가
          얼마나 찼는지 확인합니다. PLT는 팔레트 적재 단위입니다.
        </p>
      </>
    ),
  },
  {
    id: "register",
    title: "4. 새 납품 등록하는 방법",
    body: (
      <>
        <ol>
          <li>
            홈 오른쪽 위 <strong>+ 새 납품 등록</strong>을 누릅니다.
          </li>
          <li>
            <strong>납품일</strong>·<strong>수량</strong>(박스 또는 PLT)을 넣습니다.
          </li>
          <li>
            <strong>품명</strong>을 고르면 거래처·지역이 <strong>자동 추천</strong>될 수
            있습니다. 틀리면 직접 고치세요.
          </li>
          <li>
            차량은 보통 <strong>자동 추천</strong>으로 둡니다. 필요하면 1호·2호 등을 직접
            고를 수 있습니다.
          </li>
          <li>
            등록하면 카드가 <strong>추천 확인</strong> 칸에 생깁니다.
          </li>
        </ol>
        <p>
          시스템이 지역·잔여 PLT를 보고 차를 제안합니다. 카드에 적힌 이유·확인 사항을
          읽고, 다르면 차량을 바꾸세요.
        </p>
      </>
    ),
  },
  {
    id: "confirm",
    title: "5. 배차 확정 · 수정 · 완료",
    body: (
      <>
        <ul>
          <li>
            <strong>배차 확정</strong> — 추천이 맞으면 눌러 확정 칸으로 보냅니다.
          </li>
          <li>
            <strong>차량 변경</strong> — 카드의 차량 선택으로 다른 호차로 바꿉니다.
          </li>
          <li>
            <strong>수정</strong> — 지역·수량·거래처 등을 고칩니다. 바뀌면 추천이 다시
            계산될 수 있습니다.
          </li>
          <li>
            <strong>삭제</strong> — 잘못 넣은 건을 지웁니다.
          </li>
          <li>
            <strong>완료</strong> — 납품이 끝나면 완료 칸으로 옮깁니다. 완료 취소도
            가능합니다.
          </li>
        </ul>
        <p>
          <strong>이 달 내보내기 / 전체 내보내기</strong>는 일정 데이터를 파일로 받을 때
          씁니다.
        </p>
      </>
    ),
  },
  {
    id: "map",
    title: "6. 경로 · 지도 기본 사용",
    body: (
      <>
        <ol>
          <li>
            메뉴에서 <strong>경로 · 지도</strong>로 들어갑니다. (홈의 같은 이름 버튼도
            동일)
          </li>
          <li>
            왼쪽은 <strong>납품지 지도</strong>, 오른쪽은 <strong>경로 계산 패널</strong>
            입니다. 두 칸은 비슷한 크기로 맞춰 두었습니다.
          </li>
          <li>
            오른쪽에서 <strong>경로 계산</strong>을 누르면, 배정된 차량별로 카카오 자동차
            길찾기가 돌아갑니다.
          </li>
          <li>
            지도에 선이 그려지고, 호차 카드에 거리(km)·시간(분)이 표시됩니다.
          </li>
        </ol>
        <p>
          지도 헤더의 <strong>크게 보기</strong>로 지도를 넓게 볼 수 있습니다.{" "}
          <kbd>Esc</kbd> 또는 <strong>닫기</strong>로 돌아갑니다.
        </p>
        <p>
          납품일이 다르면 위쪽 날짜를 바꿔 주세요. 일정 보드와 같은 날짜를 쓰는 것이
          좋습니다.
        </p>
      </>
    ),
  },
  {
    id: "order",
    title: "7. 방문 순서 바꾸기",
    body: (
      <>
        <p>같은 호차 안에서 어느 납품지를 먼저 갈지 정하는 기능입니다.</p>
        <ul>
          <li>
            <strong>드래그</strong> — 목록 항목을 잡아 위아래로 옮긴 뒤 놓으면 순서가
            저장되고 경로가 다시 계산됩니다.
          </li>
          <li>
            <strong>추천 순서</strong> — 거리 기준으로 순서를 제안합니다. (제약이 있으면
            그것도 반영)
          </li>
          <li>
            <strong>현장 제약 (자연어)</strong> — 예: 「인천항 먼저, 만도는 나중에」처럼
            적은 뒤 <strong>제약 해석</strong>을 누르면, 해당 호차 순서를 맞추고 경로를
            다시 그립니다.
          </li>
        </ul>
        <p>
          해석 문구만 나오고 목록이 안 바뀌면 새로고침 후 다시 시도하거나, 제약 문장에
          호차 이름(1호차·2호차)을 넣어 보세요.
        </p>
      </>
    ),
  },
  {
    id: "alts",
    title: "8. 다른 경로 (길 종류 고르기)",
    body: (
      <>
        <p>
          방문 <em>순서</em>가 아니라, 같은 순서에서 <strong>어느 길로 갈지</strong>를
          고르는 기능입니다. 호차 카드의 <strong>다른 경로</strong>를 누르세요.
        </p>
        <ul>
          <li>
            <strong>추천</strong> — 교통을 반영한 기본 추천 (최초 경로 계산과 동일)
          </li>
          <li>
            <strong>최단 시간</strong> — 가장 빠른 길
          </li>
          <li>
            <strong>최단 거리</strong> — 가장 짧은 길
          </li>
          <li>
            <strong>큰길 우선</strong> — 대로 위주
          </li>
        </ul>
        <p>하나를 고르면 그 호차의 지도 선·거리·시간이 바뀝니다.</p>
      </>
    ),
  },
  {
    id: "settings",
    title: "9. 설정 메뉴",
    body: (
      <>
        <ul>
          <li>
            <strong>처음 가져오기</strong> — 엑셀·초기 일정을 시스템에 넣을 때 사용합니다.
            이미 일정이 있으면 보통 홈에서 바로 작업하면 됩니다.
          </li>
          <li>
            <strong>차량</strong> — 톤수·최대 PLT 등 차량 기준을 확인·수정합니다.
          </li>
          <li>
            <strong>지역</strong> — 납품지가 수도권인지 지방인지 등 권역 기준입니다. 추천
            차량에 영향을 줍니다.
          </li>
        </ul>
        <p>
          일상 배차는 대부분 <strong>일정 · 배차</strong>와 <strong>경로 · 지도</strong>
          만으로 충분합니다.
        </p>
      </>
    ),
  },
  {
    id: "tips",
    title: "10. 자주 하는 실수 · 팁",
    body: (
      <>
        <ul>
          <li>
            지도에 점이 안 보이면 — 주소·지역명 좌표가 아직 없을 수 있습니다. 잠시 기다리거나
            지역/거래처 정보를 확인하세요.
          </li>
          <li>
            경로 계산이 직선만 나오면 — 카카오 REST 키·일일 쿼터를 확인하세요. (서버
            환경변수)
          </li>
          <li>
            배포 사이트가 느리면 — 첫 로딩은 DB(Neon) 깨우느라 잠깐 걸릴 수 있습니다. 한
            번 더 새로고침해 보세요.
          </li>
          <li>
            날짜를 바꿨는데 내용이 이상하면 — 홈과 지도의 <strong>납품일</strong>이 같은지
            확인하세요.
          </li>
          <li>
            낱개 박스(PLT 환산 없음)는 적재율에 안 잡힐 수 있습니다. 카드의 확인 사항을
            꼭 읽으세요.
          </li>
        </ul>
      </>
    ),
  },
] as const;

export function UserGuideContent() {
  return (
    <div className="user-guide-page-layout">
      <nav aria-label="설명서 목차" className="user-guide-toc">
        <p className="user-guide-toc-title">목차</p>
        <ol>
          {USER_GUIDE_SECTIONS.map((section) => (
            <li key={section.id}>
              <a href={`#guide-${section.id}`}>{section.title}</a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="user-guide-body">
        {USER_GUIDE_SECTIONS.map((section) => (
          <section
            className="user-guide-section"
            id={`guide-${section.id}`}
            key={section.id}
          >
            <h3>{section.title}</h3>
            {section.body}
          </section>
        ))}
      </div>
    </div>
  );
}
