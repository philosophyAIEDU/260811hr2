/* =========================================================================
   화면 5 : 미답변 질문 (unanswered.js)
   -------------------------------------------------------------------------
   규정에서 근거를 찾지 못해 정해진 안내 문구로 답한 질문이 자동으로 쌓이는 곳.
   ★ 통계·그래프·순위·개수 표시는 만들지 않는다. 단순 목록만 보여준다.
   ========================================================================= */

var Unanswered = (function () {

  var 요소 = UI.요소;

  function 초기화() {
    연결하기();
    목록그리기();
  }

  function 연결하기() {
    요소('미답변다운로드버튼').addEventListener('click', 다운로드);

    // 목록을 새로 그릴 때마다 삭제 버튼이 새로 생기므로, 바깥 상자에 한 번만 붙여 둔다.
    요소('미답변목록').addEventListener('click', function (e) {
      var 삭제버튼 = e.target.closest('.미답변-삭제');
      if (삭제버튼) 삭제하기(parseInt(삭제버튼.dataset.인덱스, 10), 삭제버튼.dataset.질문);
    });
  }

  function 목록그리기() {
    DB.getUnanswered().then(function (목록) {
      var 상자 = 요소('미답변목록');
      var 빈칸 = 요소('미답변-빈칸');

      if (목록.length === 0) {
        상자.innerHTML = '';
        빈칸.classList.remove('숨김');
        return;
      }
      빈칸.classList.add('숨김');

      // 최근 질문이 위로 오도록
      var 순서 = 목록.map(function (항목, 인덱스) { return { 항목: 항목, 인덱스: 인덱스 }; }).reverse();

      상자.innerHTML = 순서.map(function (묶음) {
        return (
          '<div class="미답변-항목">' +
            '<div class="미답변-가운데">' +
              '<div class="미답변-질문">' + UI.안전한글자(묶음.항목.question) + '</div>' +
              '<div class="미답변-일시">' + UI.안전한글자(묶음.항목.at) + '</div>' +
            '</div>' +
            '<button type="button" class="버튼 위험 작게 미답변-삭제" ' +
                    'data-인덱스="' + 묶음.인덱스 + '" data-질문="' + UI.안전한글자(묶음.항목.question) + '">삭제</button>' +
          '</div>'
        );
      }).join('');
    });
  }

  function 삭제하기(인덱스, 질문) {
    var 확인 = window.confirm('"' + 질문 + '" 질문을 목록에서 지울까요?');
    if (!확인) return;

    DB.deleteUnanswered(인덱스).then(function () {
      목록그리기();
      UI.쪽지('목록에서 지웠습니다.');
    });
  }

  /* -----------------------------------------------------------------------
     txt로 내려받기
     ----------------------------------------------------------------------- */
  function 다운로드() {
    DB.getUnanswered().then(function (목록) {
      if (목록.length === 0) {
        UI.쪽지('내려받을 미답변 질문이 없습니다.', '오류');
        return;
      }

      var 줄들 = [
        '미답변 질문 목록',
        '내려받은 날짜 : ' + DB.nowString(),
        '(규정에서 근거를 찾지 못해 안내 문구로 답한 질문 목록입니다)',
        ''
      ];
      목록.forEach(function (항목, 인덱스) {
        줄들.push((인덱스 + 1) + '. [' + 항목.at + '] ' + 항목.question);
      });

      var 글 = 줄들.join('\n');
      var 조각 = new Blob([글], { type: 'text/plain;charset=utf-8' });
      var 주소 = URL.createObjectURL(조각);

      var 링크 = document.createElement('a');
      링크.href = 주소;
      링크.download = '미답변질문_' + DB.nowString().slice(0, 10) + '.txt';
      document.body.appendChild(링크);
      링크.click();
      document.body.removeChild(링크);
      URL.revokeObjectURL(주소);

      UI.쪽지('미답변 질문 파일을 내려받았습니다.');
    });
  }

  return {
    초기화: 초기화,
    목록그리기: 목록그리기
  };
})();
