/* =========================================================================
   파일에서 글자 뽑아내기 (file-extract.js)
   -------------------------------------------------------------------------
   PDF, DOCX, TXT, MD 파일을 브라우저 안에서만 처리합니다.
   파일 내용은 어디로도 전송하지 않습니다.

   PDF  → pdf.js (CDN)
   DOCX → mammoth.js (CDN)
   TXT/MD → 브라우저 내장 FileReader

   외부 라이브러리는 실제로 필요할 때(=해당 형식 파일을 처음 올릴 때)에만
   CDN에서 불러옵니다. (처음 화면 여는 속도를 위해 미리 불러오지 않음)
   ========================================================================= */

var FileExtract = (function () {

  var pdfJs준비됨 = false;
  var mammoth준비됨 = false;
  var pdfJs불러오는중 = null;
  var mammoth불러오는중 = null;

  /* -----------------------------------------------------------------------
     외부 스크립트 불러오기
     ----------------------------------------------------------------------- */
  function 스크립트불러오기(주소) {
    return new Promise(function (resolve, reject) {
      var 태그 = document.createElement('script');
      태그.src = 주소;
      태그.onload = function () { resolve(); };
      태그.onerror = function () {
        reject(new Error('필요한 프로그램을 인터넷에서 받아오지 못했습니다. 인터넷 연결을 확인해 주세요.'));
      };
      document.head.appendChild(태그);
    });
  }

  function pdfJs준비하기() {
    if (pdfJs준비됨) return Promise.resolve();
    if (pdfJs불러오는중) return pdfJs불러오는중;

    pdfJs불러오는중 = 스크립트불러오기(CONFIG.CDN.PDFJS).then(function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = CONFIG.CDN.PDFJS_WORKER;
      pdfJs준비됨 = true;
    });
    return pdfJs불러오는중;
  }

  function mammoth준비하기() {
    if (mammoth준비됨) return Promise.resolve();
    if (mammoth불러오는중) return mammoth불러오는중;

    mammoth불러오는중 = 스크립트불러오기(CONFIG.CDN.MAMMOTH).then(function () {
      mammoth준비됨 = true;
    });
    return mammoth불러오는중;
  }

  /* -----------------------------------------------------------------------
     파일 읽기 도우미
     ----------------------------------------------------------------------- */
  function 텍스트로읽기(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('파일을 읽는 중 오류가 발생했습니다.')); };
      reader.readAsText(file, 'utf-8');
    });
  }

  function 버퍼로읽기(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('파일을 읽는 중 오류가 발생했습니다.')); };
      reader.readAsArrayBuffer(file);
    });
  }

  /* -----------------------------------------------------------------------
     형식별 추출
     ----------------------------------------------------------------------- */
  function 확장자(파일명) {
    var m = /\.([a-zA-Z0-9]+)$/.exec(String(파일명 || ''));
    return m ? m[1].toLowerCase() : '';
  }

  function PDF에서추출(file) {
    return pdfJs준비하기()
      .then(function () { return 버퍼로읽기(file); })
      .then(function (버퍼) { return window.pdfjsLib.getDocument({ data: 버퍼 }).promise; })
      .then(function (문서) {
        var 페이지번호들 = [];
        for (var i = 1; i <= 문서.numPages; i++) 페이지번호들.push(i);

        return 페이지번호들.reduce(function (미리작업, 번호) {
          return 미리작업.then(function (지금까지) {
            return 문서.getPage(번호)
              .then(function (page) { return page.getTextContent(); })
              .then(function (내용) {
                var 페이지글자 = 내용.items.map(function (조각) { return 조각.str; }).join(' ');
                return 지금까지 + 페이지글자 + '\n\n';
              });
          });
        }, Promise.resolve(''));
      })
      .catch(function (오류) {
        // pdf.js 가 못 여는 파일(암호화 등)도 같은 오류 문구로 안내한다.
        throw new Error('PDF 파일을 읽는 중 문제가 발생했습니다. 파일이 손상되었거나 암호로 잠겨 있을 수 있습니다.');
      });
  }

  function DOCX에서추출(file) {
    return mammoth준비하기()
      .then(function () { return 버퍼로읽기(file); })
      .then(function (버퍼) { return window.mammoth.extractRawText({ arrayBuffer: 버퍼 }); })
      .then(function (결과) { return 결과.value; })
      .catch(function (오류) {
        if (오류 && 오류.message && 오류.message.indexOf('인터넷') !== -1) throw 오류;
        throw new Error('워드(DOCX) 파일을 읽는 중 문제가 발생했습니다. 파일이 손상되지 않았는지 확인해 주세요.');
      });
  }

  function TXT_MD에서추출(file) {
    return 텍스트로읽기(file);
  }

  /* -----------------------------------------------------------------------
     파일 하나에서 글자를 뽑아낸다.
     반환 : Promise<string>  (실패하면 한국어 오류 메시지로 reject)
     ----------------------------------------------------------------------- */
  function 추출하기(file) {
    var ext = 확장자(file.name);

    if (CONFIG.ALLOWED_EXTENSIONS.indexOf(ext) === -1) {
      return Promise.reject(new Error(
        '지원하지 않는 파일 형식입니다 (.' + (ext || '알 수 없음') + '). PDF, DOCX, TXT, MD 파일만 올릴 수 있습니다.'
      ));
    }

    if (ext === 'pdf')  return PDF에서추출(file);
    if (ext === 'docx') return DOCX에서추출(file);
    return TXT_MD에서추출(file);
  }

  return {
    추출하기: 추출하기,
    확장자: 확장자
  };
})();
