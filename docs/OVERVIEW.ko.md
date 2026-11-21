# Confido — 한눈 요약

**한 줄:** Jira 릴리스의 '출시 가능성'을 증거 기반으로 0~100점 계산하고, AI는 그 설명만 쓰는 앱.

## 왜 다른가
- 점수·판정·조건·릴리스 노트는 **규칙 엔진이 계산**한다. 모델은 숫자를 못 바꾼다.
- 감점 하나하나가 **티켓 키(PAY-1401 등)** 와 근거 문장으로 추적된다.
- API 키·Jira 토큰·네트워크 없이도 완전히 동작한다(샘플 릴리스 2종 내장).
- MCP 서버 + Forge(Rovo 에이전트·스킬·MCP) 로 같은 엔진을 4개 표면에서 동일한 숫자로 제공.

## 실행
```bash
npm install
npm start          # http://localhost:4173
npm test           # 53개 테스트
npm run cli -- --preset payments      # 51/100 AT RISK
npm run cli -- --csv export.csv       # 내 Jira CSV로 평가
npm run mcp                           # MCP(stdin/stdout) 서버
```

## 구성
| 표면 | 용도 |
| --- | --- |
| 웹앱 | 클릭 한 번으로 브리프, 발표·심사용 화면 |
| CLI | 마크다운/JSON 리포트, CI·자동화 |
| MCP | Claude Desktop·Cursor 등에서 `assess_release` 등 5개 도구 |
| Forge | Jira 안 Rovo 에이전트 'Confido Release Captain' + `rovo:mcp` |

## 계산 방식
`100 − Σ min(발견 수, 상한) × 가중치` (규칙 10종). 밴드(85/65/45)에 **게이트**가 붙어
블로커 1건이면 절대 단순 SHIP이 될 수 없고, 2건 이상이면 AT RISK보다 좋아질 수 없다.

## 아직 안 된 것 (사용자 손이 필요한 지점)
1. `forge register` / `forge deploy` / `forge install` — Atlassian 계정 소유자만 가능.
2. 심사위원용 설치 링크(개발자 콘솔 → Distribution → Start sharing).
3. 데모 영상 촬영·업로드(대본: `docs/DEMO.md`), Devpost 제출.
4. 저장소 공개(현재는 로컬 git 저장소만).

## 마감
- SLAY HACKS: 2026-12-07 (Devpost 표기 12-08 07:00 KST) — 검증 필요
- Codegeist 2026: 2026-12-22 12:00 PST = **2026-12-23 05:00 KST**
