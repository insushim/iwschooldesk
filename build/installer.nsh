; SchoolDesk — 언인스톨 시 사용자 데이터 삭제 선택
; electron-builder NSIS customUnInit + customUnInstall 매크로 override
;
; 동작:
;   - 앱 업데이트로 인한 재설치 때는 데이터 보존 (isUpdated 가드)
;   - 일반 언인스톨 시 YES/NO 다이얼로그 표시
;     * 예(IDYES) → %APPDATA%\SchoolDesk 완전 삭제 (복구 불가)
;     * 아니오(IDNO, 기본값) → 데이터 보존 → 재설치 시 그대로 복원
;
; oneClick: true 모드는 언인스톨러도 silent(/S)로 실행되므로
; customUnInit 에서 SetSilent normal 로 UI 모드 강제.
; (단, 업데이트 재설치로 인한 silent 호출은 isUpdated 가드가 먼저 걸러냄)

!macro customUnInit
  ${ifNot} ${isUpdated}
    SetSilent normal
  ${endIf}
!macroend

; ★ 설치 시작 직전 — 사용자 클릭 없이 SchoolDesk 모든 프로세스 자동 강제 종료.
;   사용자 요청: "수동 종료 없이 자동 종료" — 다이얼로그 일절 없음, 그냥 죽이고 설치 진행.
!macro customInit
  ; 1차 — taskkill /F /T 로 main + GPU + renderer + utility + tray 전부 자식 트리 종료
  nsExec::Exec 'taskkill /F /IM SchoolDesk.exe /T'
  Sleep 1500
  ; 2차 — 잔여 프로세스 정리 (재기동 race condition 대비)
  nsExec::Exec 'taskkill /F /IM SchoolDesk.exe /T'
  Sleep 500
  ; 3차 — wmic 으로 PID 기반 직접 삭제 (가장 강력)
  nsExec::Exec 'wmic process where "name=\"SchoolDesk.exe\"" delete'
  Sleep 500
!macroend

; 설치 중에도 한 번 더 (자동 시작 등 외부 트리거로 다시 뜨는 케이스 방어)
!macro customInstall
  nsExec::Exec 'taskkill /F /IM SchoolDesk.exe /T'
  Sleep 500

  ; ★ Windows Error Reporting 제외 등록 — PC 재시작/디스플레이 변경 시 종료-중 GPU/Network 자식
  ;   프로세스가 충돌(0x80000003)하며 뜨던 "응용 프로그램 오류" 팝업을 설치 시점에 미리 차단.
  ;   앱도 시작 시 같은 키를 쓰지만(이중 안전), 설치 직후부터 보장되도록 여기서도 등록한다.
  ;   HKCU(관리자 불필요)·exe 한정·같은 이름의 모든 자식 프로세스 커버. 데이터엔 영향 없음.
  WriteRegDWORD HKCU "Software\Microsoft\Windows\Windows Error Reporting\ExcludedApplications" "${PRODUCT_NAME}.exe" 1
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
      "사용자 데이터(학교 정보, 시간표, 일정, 업무, 메모, 체크리스트 등)도 함께 삭제하시겠습니까?$\r$\n$\r$\n[예]  모든 개인 데이터를 완전히 삭제합니다. (복구 불가)$\r$\n[아니오]  데이터를 PC에 보존합니다. 재설치 시 그대로 복원됩니다.$\r$\n$\r$\n보존 위치: %APPDATA%\school-desk" \
      /SD IDNO \
      IDNO skip_appdata_removal
      ; 실제 Electron userData 경로는 package.json 의 name("school-desk") 기준 —
      ; 과거 설치본은 ${PRODUCT_NAME}("SchoolDesk") 에 저장된 경우도 있어 양쪽 모두 삭제한다.
      RMDir /r "$APPDATA\${PRODUCT_NAME}"
      RMDir /r "$APPDATA\school-desk"
      ; 일부 환경은 LOCALAPPDATA 밑에 남기기도 하므로 함께 시도 (실패는 무시).
      RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}"
      RMDir /r "$LOCALAPPDATA\school-desk"
      DetailPrint "사용자 데이터를 삭제했습니다."
      Goto appdata_done
    skip_appdata_removal:
      DetailPrint "사용자 데이터는 보존되었습니다: $APPDATA\school-desk"
    appdata_done:
    ; 진짜 삭제(업데이트 아님)일 때만 WER 제외 등록도 정리.
    DeleteRegValue HKCU "Software\Microsoft\Windows\Windows Error Reporting\ExcludedApplications" "${PRODUCT_NAME}.exe"
  ${endIf}
!macroend
