/* =========================================================================
   화면 3 : 규정 자료 (docs.js)
   -------------------------------------------------------------------------
   - 파일 첨부(끌어다 놓기 포함) → 브라우저 안에서 글자 추출 → IndexedDB 저장
   - 자료 목록 표시 / 삭제
   - "샘플로 체험해보기"
   - 규정집 내보내기 / 불러오기 (API 키·대화 내용은 절대 포함하지 않음)
   - "문서가 없어요" → 마법사 화면으로 이동 (마법사 내용은 다음 단계에서 제작)
   ========================================================================= */

var Docs = (function () {

  var 요소 = UI.요소;

  /* =====================================================================
     0. 시작
     ===================================================================== */
  function 초기화() {
    요소('업로드경고').textContent = CONFIG.UPLOAD_WARNING;

    연결하기();
    자료목록그리기();
  }

  function 연결하기() {
    var 드롭영역 = 요소('드롭영역');
    var 파일입력 = 요소('파일입력');

    // 영역을 누르거나(버튼 포함, 이벤트가 위로 전달됨) 키보드로 접근하면 파일 선택창을 연다.
    드롭영역.addEventListener('click', function () { 파일입력.click(); });
    드롭영역.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); 파일입력.click(); }
    });

    파일입력.addEventListener('change', function () {
      파일들처리하기(파일입력.files);
      파일입력.value = '';   // 같은 파일을 다시 올릴 수 있도록 비운다
    });

    // 끌어다 놓기 : 문서 전체에서 기본 동작(파일을 새 탭으로 여는 것)을 막는다.
    ['dragover', 'drop'].forEach(function (이벤트이름) {
      document.addEventListener(이벤트이름, function (e) { e.preventDefault(); });
    });

    드롭영역.addEventListener('dragover', function (e) {
      e.preventDefault();
      드롭영역.classList.add('끌어오는중');
    });
    드롭영역.addEventListener('dragleave', function () {
      드롭영역.classList.remove('끌어오는중');
    });
    드롭영역.addEventListener('drop', function (e) {
      e.preventDefault();
      드롭영역.classList.remove('끌어오는중');
      if (e.dataTransfer && e.dataTransfer.files) 파일들처리하기(e.dataTransfer.files);
    });

    요소('마법사시작버튼').addEventListener('click', function () {
      if (window.Wizard) Wizard.리셋();
      UI.화면보이기('마법사');
    });

    요소('질문하러가기버튼').addEventListener('click', function () {
      UI.화면보이기('채팅');
      if (window.Chat) Chat.화면진입시();
    });

    요소('샘플불러오기버튼').addEventListener('click', 샘플불러오기);

    요소('샘플미리보기버튼').addEventListener('click', 미리보기열기);
    요소('샘플미리보기-닫기1').addEventListener('click', 미리보기닫기);
    요소('샘플미리보기-닫기2').addEventListener('click', 미리보기닫기);
    요소('샘플미리보기-배경').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) 미리보기닫기();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !요소('샘플미리보기-배경').classList.contains('숨김')) 미리보기닫기();
    });
    요소('샘플미리보기-등록버튼').addEventListener('click', function () {
      미리보기닫기();
      샘플불러오기();
    });
    요소('규정집내보내기버튼').addEventListener('click', 규정집내보내기);

    요소('규정집불러오기버튼').addEventListener('click', function () {
      요소('규정집불러오기입력').click();
    });
    요소('규정집불러오기입력').addEventListener('change', function (e) {
      var 파일 = e.target.files && e.target.files[0];
      e.target.value = '';
      if (파일) 규정집불러오기(파일);
    });

    // 자료 목록 안의 삭제 버튼들 (목록을 새로 그릴 때마다 버튼이 새로 생기므로,
    // 바깥 상자에 한 번만 붙여 두고 클릭된 버튼을 찾아 처리한다)
    요소('자료목록').addEventListener('click', function (e) {
      var 삭제버튼 = e.target.closest('.자료항목-삭제');
      if (!삭제버튼) return;
      자료삭제(삭제버튼.dataset.id, 삭제버튼.dataset.name);
    });
  }

  /* =====================================================================
     1. 파일 첨부 → 글자 추출 → 저장
     ===================================================================== */
  function 파일들처리하기(파일목록) {
    var 파일들 = Array.prototype.slice.call(파일목록 || []);
    if (파일들.length === 0) return;

    // 여러 개를 한꺼번에 올려도 하나씩 순서대로 처리한다.
    파일들.reduce(function (앞선작업, 파일) {
      return 앞선작업.then(function () { return 파일하나처리하기(파일); });
    }, Promise.resolve());
  }

  function 파일하나처리하기(file) {
    var 항목 = 처리항목만들기(file.name);

    return FileExtract.추출하기(file)
      .then(function (글자) {
        var 다듬은글자 = String(글자 || '').trim();

        if (다듬은글자.length === 0) {
          처리항목상태(항목, '오류',
            '이 파일은 글자를 읽을 수 없습니다. 워드나 텍스트로 변환해 다시 올려주세요.');
          return;
        }

        return DB.addDocument(file.name, 다듬은글자, '파일첨부').then(function () {
          처리항목상태(항목, '완료', 다듬은글자.length.toLocaleString('ko-KR') + '자 등록됨');
          자료목록그리기();
          setTimeout(function () { 항목및제거(항목); }, 1600);
        });
      })
      .catch(function (오류) {
        처리항목상태(항목, '오류', 오류 && 오류.message ? 오류.message : '파일을 처리하지 못했습니다.');
      });
  }

  function 처리항목만들기(파일명) {
    var 상자 = document.createElement('div');
    상자.className = '처리항목';
    상자.innerHTML =
      '<span class="처리항목-표시"><span class="돌아감" aria-hidden="true"></span></span>' +
      '<span class="처리항목-이름">' + UI.안전한글자(파일명) + '</span>' +
      '<span class="처리항목-말">읽는 중…</span>';
    요소('처리목록').appendChild(상자);
    return 상자;
  }

  function 처리항목상태(항목, 종류, 말) {
    항목.className = '처리항목 ' + 종류;
    var 표시 = 항목.querySelector('.처리항목-표시');
    var 말상자 = 항목.querySelector('.처리항목-말');
    표시.textContent = 종류 === '완료' ? '✔' : '⚠';
    말상자.textContent = 말;
  }

  function 항목및제거(항목) {
    if (항목 && 항목.parentNode) 항목.parentNode.removeChild(항목);
  }

  /* =====================================================================
     2. 자료 목록 그리기
     ===================================================================== */
  function 자료목록그리기() {
    DB.getAllDocuments().then(function (자료들) {
      var 목록상자 = 요소('자료목록');
      var 빈칸 = 요소('자료목록-빈칸');
      var 요약 = 요소('자료목록-요약');

      var 이동버튼 = 요소('질문하러가기버튼');

      if (자료들.length === 0) {
        목록상자.innerHTML = '';
        빈칸.classList.remove('숨김');
        요약.textContent = '등록된 자료가 없습니다';
        이동버튼.classList.add('숨김');
        return;
      }
      빈칸.classList.add('숨김');
      이동버튼.classList.remove('숨김');

      // 최근 등록한 것이 위로 오도록
      var 정렬된것 = 자료들.slice().sort(function (a, b) { return b.id.localeCompare(a.id); });

      var 총글자수 = 자료들.reduce(function (합, d) { return 합 + (d.charCount || 0); }, 0);
      var 검색방식 = 총글자수 <= CONFIG.FULL_CONTEXT_LIMIT
        ? '질문 시 전체 내용을 그대로 전달합니다'
        : '자료가 많아 질문과 관련된 부분만 골라 전달합니다';
      요약.textContent = '등록된 자료 ' + 자료들.length + '건 · 총 ' +
        UI.숫자표기(총글자수) + '자 (' + 검색방식 + ')';

      목록상자.innerHTML = 정렬된것.map(자료항목HTML).join('');
    });
  }

  function 자료항목HTML(자료) {
    var 배지글 = 자료.source === '마법사생성' ? '마법사 생성' : '파일 첨부';
    var 배지class = 자료.source === '마법사생성' ? '마법사생성' : '파일첨부';

    return (
      '<div class="자료항목">' +
        '<div class="자료항목-표">' + (자료.source === '마법사생성' ? '✏️' : '📄') + '</div>' +
        '<div class="자료항목-가운데">' +
          '<div class="자료항목-이름줄">' +
            '<span class="자료항목-이름">' + UI.안전한글자(자료.name) + '</span>' +
            '<span class="배지 ' + 배지class + '">' + 배지글 + '</span>' +
          '</div>' +
          '<div class="자료항목-부가">' +
            UI.숫자표기(자료.charCount) + '자 · ' + UI.안전한글자(자료.createdAt) + ' 등록' +
          '</div>' +
        '</div>' +
        '<button type="button" class="버튼 위험 작게 자료항목-삭제" ' +
                'data-id="' + UI.안전한글자(자료.id) + '" data-name="' + UI.안전한글자(자료.name) + '">' +
          '삭제' +
        '</button>' +
      '</div>'
    );
  }

  function 자료삭제(docId, name) {
    var 확인 = window.confirm('"' + name + '" 자료를 삭제할까요?\n삭제하면 이 자료를 근거로 한 답변을 더는 할 수 없습니다.');
    if (!확인) return;

    DB.deleteDocument(docId).then(function () {
      자료목록그리기();
      UI.쪽지('"' + name + '" 자료를 삭제했습니다.');
    });
  }

  /* =====================================================================
     2-1. 샘플 내용 미리보기
     -------------------------------------------------------------------
     ★ sample/샘플규정.md 파일을 새 탭에서 직접 열지 않는다.
       서버·file:// 환경에 따라 글자 인코딩이 깨지거나(euc-kr로 잘못 인식),
       file:// 로 연 경우 fetch 자체가 막히기 때문이다.
       이미 브라우저 안에 올바르게 들어와 있는 SAMPLE_DATA(js/sample-data.js)를
       그대로 화면에 그려서 보여준다. (index.html의 UTF-8 설정을 그대로 따르므로
       어떤 환경에서도 글자가 깨지지 않는다)
     ===================================================================== */
  function 미리보기열기() {
    요소('샘플미리보기-본문').innerHTML = SAMPLE_DATA.map(function (자료) {
      return (
        '<div class="미리보기-자료">' +
          '<p class="미리보기-자료-이름">📄 ' + UI.안전한글자(자료.자료명) + '</p>' +
          '<p class="미리보기-자료-글">' + UI.안전한글자(자료.원문텍스트) + '</p>' +
        '</div>'
      );
    }).join('');

    요소('샘플미리보기-배경').classList.remove('숨김');
    document.body.style.overflow = 'hidden';
  }

  function 미리보기닫기() {
    요소('샘플미리보기-배경').classList.add('숨김');
    document.body.style.overflow = '';
  }

  /* =====================================================================
     3. 샘플로 체험해보기
     ===================================================================== */
  function 샘플불러오기() {
    DB.getAllDocuments().then(function (기존자료들) {
      var 기존이름들 = 기존자료들.map(function (d) { return d.name; });
      var 새로넣을것 = SAMPLE_DATA.filter(function (샘플) {
        return 기존이름들.indexOf(샘플.자료명) === -1;
      });

      if (새로넣을것.length === 0) {
        UI.쪽지('샘플 규정이 이미 모두 등록되어 있습니다.');
        return;
      }

      return 새로넣을것.reduce(function (앞선것, 샘플) {
        return 앞선것.then(function () {
          return DB.addDocument(샘플.자료명, 샘플.원문텍스트, '파일첨부');
        });
      }, Promise.resolve()).then(function () {
        자료목록그리기();
        UI.쪽지('샘플 규정 ' + 새로넣을것.length + '건을 등록했습니다.');
      });
    });
  }

  /* =====================================================================
     4. 규정집 내보내기 / 불러오기
     ===================================================================== */
  function 규정집내보내기() {
    DB.exportRules().then(function (내용) {
      if (내용.규정자료.length === 0) {
        UI.쪽지('내보낼 규정 자료가 없습니다. 먼저 자료를 등록해 주세요.', '오류');
        return;
      }

      var 글자 = JSON.stringify(내용, null, 2);
      var 조각 = new Blob([글자], { type: 'application/json' });
      var 주소 = URL.createObjectURL(조각);

      var 링크 = document.createElement('a');
      링크.href = 주소;
      링크.download = '사내규정집.json';
      document.body.appendChild(링크);
      링크.click();
      document.body.removeChild(링크);
      URL.revokeObjectURL(주소);

      UI.쪽지('규정집 파일을 내려받았습니다.');
    });
  }

  function 규정집불러오기(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var 데이터;
      try {
        데이터 = JSON.parse(String(reader.result || ''));
      } catch (e) {
        UI.쪽지('규정집 파일 형식이 올바르지 않습니다. (.json 파일인지 확인해 주세요)', '오류');
        return;
      }

      DB.importRules(데이터)
        .then(function (건수) {
          자료목록그리기();
          UI.쪽지('규정집에서 ' + 건수 + '건을 불러왔습니다.');
        })
        .catch(function (오류) {
          UI.쪽지(오류 && 오류.message ? 오류.message : '규정집을 불러오지 못했습니다.', '오류');
        });
    };
    reader.onerror = function () {
      UI.쪽지('파일을 읽는 중 오류가 발생했습니다.', '오류');
    };
    reader.readAsText(file, 'utf-8');
  }

  return {
    초기화: 초기화,
    자료목록그리기: 자료목록그리기
  };
})();
