/* =========================================================================
   화면 공통 도구 (ui.js)
   -------------------------------------------------------------------------
   화면 전환, 잠깐 뜨는 알림(쪽지), 글자 안전 처리 등 여러 화면이 함께 쓰는 것들.
   ========================================================================= */

var UI = (function () {

  /* 화면 이름 → 실제 요소 id */
  var 화면목록 = {
    설정:   '화면-설정',
    채팅:   '화면-채팅',
    자료:   '화면-자료',
    마법사: '화면-마법사',
    미답변: '화면-미답변'
  };

  /* 상단 탭에 대응하는 화면 (탭은 3개뿐) */
  var 탭화면 = ['채팅', '자료', '미답변'];

  var 현재화면 = null;

  /* --------------------------------------------------------------------
     짧은 도우미
     -------------------------------------------------------------------- */
  function 요소(id) { return document.getElementById(id); }

  /* 사용자가 쓴 글을 화면에 넣기 전에 위험한 기호를 없앤다. */
  function 안전한글자(값) {
    return String(값 == null ? '' : 값)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* 숫자에 쉼표 붙이기 : 18420 → 18,420 */
  function 숫자표기(값) {
    return String(값 == null ? 0 :값).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* --------------------------------------------------------------------
     화면 전환
     -------------------------------------------------------------------- */
  function 화면보이기(이름) {
    if (!화면목록[이름]) return;

    Object.keys(화면목록).forEach(function (key) {
      var 요소하나 = 요소(화면목록[key]);
      if (요소하나) 요소하나.classList.toggle('숨김', key !== 이름);
    });

    현재화면 = 이름;
    탭표시맞추기();
    window.scrollTo(0, 0);
  }

  function 지금화면() { return 현재화면; }

  /* 현재 화면에 맞춰 탭에 밑줄을 옮긴다. */
  function 탭표시맞추기() {
    var 탭들 = document.querySelectorAll('#탭들 .탭');
    Array.prototype.forEach.call(탭들, function (탭) {
      탭.classList.toggle('현재', 탭.dataset.화면 === 현재화면);
    });
  }

  /* 키가 없으면 탭 3개를 눌러도 넘어가지 못하게 잠근다. */
  function 탭잠금(잠글까) {
    var 탭들 = document.querySelectorAll('#탭들 .탭');
    Array.prototype.forEach.call(탭들, function (탭) {
      탭.disabled = 잠글까;
      탭.title = 잠글까 ? 'API 키를 먼저 등록해 주세요' : '';
    });
  }

  /* --------------------------------------------------------------------
     잠깐 떴다 사라지는 알림
     -------------------------------------------------------------------- */
  var 쪽지시계 = null;

  function 쪽지(글, 종류) {
    var 기존 = document.querySelector('.쪽지');
    if (기존) 기존.remove();
    if (쪽지시계) clearTimeout(쪽지시계);

    var 상자 = document.createElement('div');
    상자.className = '쪽지' + (종류 === '오류' ? ' 오류' : '');
    상자.setAttribute('role', 'status');
    상자.textContent = 글;
    document.body.appendChild(상자);

    쪽지시계 = setTimeout(function () {
      if (상자.parentNode) 상자.remove();
    }, 2600);
  }

  /* --------------------------------------------------------------------
     원문 보기 창 (모달)
     -------------------------------------------------------------------
     샘플 미리보기, 등록된 자료의 원문 보기, 답변 출처의 교차 확인에
     모두 같은 창을 씁니다.

     설정값
       제목    : 창 맨 위 제목
       설명    : 제목 아래 한 줄 안내 (없으면 생략)
       항목들  : [{ 이름, 글, 강조여부 }] — 강조여부가 true면 노란 배경으로 표시
       주버튼  : { 글, 실행 } — 없으면 [닫기]만 보임
     -------------------------------------------------------------------- */
  var 주버튼실행 = null;

  function 문서창열기(설정) {
    요소('문서창-제목').textContent = 설정.제목 || '원문 보기';

    var 설명칸 = 요소('문서창-설명');
    설명칸.textContent = 설정.설명 || '';
    설명칸.classList.toggle('숨김', !설정.설명);

    요소('문서창-본문').innerHTML = (설정.항목들 || []).map(function (항목) {
      return (
        '<div class="문서항목' + (항목.강조여부 ? ' 강조' : '') + '">' +
          '<p class="문서항목-이름">' + (항목.강조여부 ? '🔎 ' : '📄 ') + 안전한글자(항목.이름) + '</p>' +
          '<p class="문서항목-글">' + 안전한글자(항목.글) + '</p>' +
        '</div>'
      );
    }).join('');

    var 주버튼 = 요소('문서창-주버튼');
    if (설정.주버튼) {
      주버튼.textContent = 설정.주버튼.글;
      주버튼.classList.remove('숨김');
      주버튼실행 = 설정.주버튼.실행;
    } else {
      주버튼.classList.add('숨김');
      주버튼실행 = null;
    }

    요소('문서창-배경').classList.remove('숨김');
    document.body.style.overflow = 'hidden';

    // 강조된 항목이 있으면 그 위치로 스크롤해 준다.
    var 강조된것 = document.querySelector('#문서창-본문 .문서항목.강조');
    if (강조된것) 강조된것.scrollIntoView({ block: 'start' });
    else 요소('문서창-본문').scrollTop = 0;
  }

  function 문서창닫기() {
    요소('문서창-배경').classList.add('숨김');
    document.body.style.overflow = '';
    주버튼실행 = null;
  }

  function 문서창연결하기() {
    요소('문서창-닫기1').addEventListener('click', 문서창닫기);
    요소('문서창-닫기2').addEventListener('click', 문서창닫기);

    요소('문서창-배경').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) 문서창닫기();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !요소('문서창-배경').classList.contains('숨김')) 문서창닫기();
    });

    요소('문서창-주버튼').addEventListener('click', function () {
      var 실행 = 주버튼실행;
      문서창닫기();
      if (실행) 실행();
    });
  }

  return {
    요소: 요소,
    안전한글자: 안전한글자,
    숫자표기: 숫자표기,
    화면보이기: 화면보이기,
    지금화면: 지금화면,
    탭잠금: 탭잠금,
    탭화면: 탭화면,
    쪽지: 쪽지,
    문서창열기: 문서창열기,
    문서창닫기: 문서창닫기,
    문서창연결하기: 문서창연결하기
  };
})();
