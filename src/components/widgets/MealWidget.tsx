import { useState, useEffect, useCallback, useRef } from 'react'
import { Utensils, Search, X, Settings, Monitor, MonitorOff, AlertCircle, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDisplayBg } from '../../lib/display-bg'
import { useIAmWallpaper } from '../../hooks/useIAmWallpaper'
import type { MealConfig, MealMenu, NeisSchool } from '../../types/meal.types'

const STORAGE_KEY = 'meal:config:v1'
const CACHE_KEY = 'meal:cache:v1'

interface MealCache {
  schoolCode: string
  ymd: string  // YYYY-MM-DD
  meals: MealMenu[]
  fetchedAt: number  // unix ms — 디버그/통계용
}

// 메뉴명 키워드 → 이모지.
// ★ pickEmoji 가 모듈 로드 시 한 번 길이 내림차순으로 정렬한다 — 짧은 키워드가
//   긴 키워드를 가로채는 false-positive 차단 (예: "오징어채" 의 "어" 가 "오징어" 보다 먼저
//   매치되어 🐟 가 잘못 나오는 버그 방지).
// ★ 1글자 키워드("어"·"감" 등)는 명백한 false-positive 만들어내므로 모두 제외.
//   "국"·"탕"·"찜"·"전"·"무" 같이 한국 급식에 핵심인 1글자만 보존.
const MEAL_EMOJI_MAP: ReadonlyArray<readonly [string, string]> = [
  // ── 밥 / 죽 ──
  ['오므라이스', '🍳'], ['카레라이스', '🍛'], ['카레', '🍛'], ['커리', '🍛'], ['하이라이스', '🍛'],
  ['비빔밥', '🍚'], ['볶음밥', '🍚'], ['덮밥', '🍚'], ['리조또', '🍚'], ['필라프', '🍚'],
  ['주먹밥', '🍙'], ['김밥', '🍙'], ['약밥', '🍙'], ['유부초밥', '🍣'], ['초밥', '🍣'],
  ['누룽지', '🍚'], ['숭늉', '🥣'],
  ['잡곡밥', '🌾'], ['보리밥', '🌾'], ['콩밥', '🌾'], ['흑미밥', '🌾'], ['백미밥', '🌾'],
  ['오곡밥', '🌾'], ['귀리밥', '🌾'], ['현미밥', '🌾'],
  ['전복죽', '🥣'], ['호박죽', '🥣'], ['팥죽', '🥣'], ['닭죽', '🥣'], ['야채죽', '🥣'],
  ['죽', '🥣'], ['수프', '🥣'], ['스프', '🥣'],
  // ── 면류 ──
  ['잡채', '🍜'], ['당면', '🍜'], ['짜장면', '🍜'], ['짜장', '🍜'], ['짬뽕', '🍜'],
  ['짜파게티', '🍜'], ['칼국수', '🍜'], ['수제비', '🍜'], ['라면', '🍜'], ['라볶이', '🍜'],
  ['우동', '🍜'], ['소바', '🍜'], ['쌀국수', '🍜'], ['냉면', '🍜'], ['비빔국수', '🍜'],
  ['잔치국수', '🍜'], ['국수', '🍜'],
  ['스파게티', '🍝'], ['파스타', '🍝'], ['로제', '🍝'], ['크림파스타', '🍝'], ['미트소스', '🍝'],
  ['떡볶이', '🍜'], ['라볶이', '🍜'], ['떡뽀끼', '🍜'],
  // ── 만두 / 핫도그 / 패스트푸드 ──
  ['군만두', '🥟'], ['찐만두', '🥟'], ['물만두', '🥟'], ['김치만두', '🥟'],
  ['만두', '🥟'], ['교자', '🥟'], ['딤섬', '🥟'], ['샤오롱바오', '🥟'],
  ['핫도그', '🌭'], ['소세지', '🌭'], ['소시지', '🌭'], ['프랑크', '🌭'],
  ['피자', '🍕'], ['햄버거', '🍔'], ['치즈버거', '🍔'], ['샌드위치', '🥪'],
  ['타코', '🌮'], ['브리또', '🌯'], ['또띠아', '🌯'], ['케밥', '🌯'],
  // ── 떡 ──
  ['떡꼬치', '🍡'], ['떡국', '🍲'], ['떡만두', '🥟'], ['찹쌀떡', '🍡'],
  ['송편', '🍡'], ['절편', '🍡'], ['인절미', '🍡'], ['시루떡', '🍡'], ['가래떡', '🍡'], ['떡', '🍡'],
  // ── 고기 ──
  ['찜닭', '🍗'], ['닭갈비', '🍗'], ['닭볶음탕', '🍗'], ['닭곰탕', '🍲'], ['닭개장', '🍲'],
  ['치킨', '🍗'], ['후라이드', '🍗'], ['양념치킨', '🍗'], ['깐풍기', '🍗'], ['깐풍', '🍗'],
  ['강정', '🍗'], ['너겟', '🍗'], ['닭', '🍗'], ['오리', '🦆'],
  ['보쌈', '🥩'], ['수육', '🥩'], ['두루치기', '🥩'], ['제육', '🥩'],
  ['LA갈비', '🥩'], ['갈비찜', '🥩'], ['갈비', '🥩'], ['불고기', '🥩'], ['스테이크', '🥩'],
  ['소고기', '🥩'], ['쇠고기', '🥩'], ['돼지고기', '🥩'], ['돼지', '🥩'], ['고기', '🥩'],
  ['삼겹', '🥓'], ['베이컨', '🥓'], ['목살', '🥩'], ['항정살', '🥓'],
  ['미트볼', '🍖'], ['떡갈비', '🍖'], ['함박', '🍖'], ['스팸', '🥫'], ['햄', '🥓'],
  ['돈가스', '🍖'], ['돈까스', '🍖'], ['까스', '🍖'], ['탕수육', '🍖'],
  ['동그랑땡', '🍖'], ['완자', '🍖'], ['미트로프', '🍖'], ['카츠', '🍖'],
  ['산적', '🍢'], ['꼬치', '🍢'], ['데리야끼', '🍢'],
  // ── 해산물 ──
  ['새우튀김', '🍤'], ['새우볶음', '🍤'], ['깐쇼새우', '🍤'], ['새우', '🍤'],
  ['튀김', '🍤'], ['모듬튀김', '🍤'],
  ['고등어', '🐟'], ['갈치', '🐟'], ['연어', '🐟'], ['삼치', '🐟'], ['임연수', '🐟'],
  ['동태', '🐟'], ['명태', '🐟'], ['황태', '🐟'], ['북어', '🐟'], ['멸치', '🐟'],
  ['잔멸치', '🐟'], ['멸치볶음', '🐟'], ['진미채', '🐟'], ['쥐포', '🐟'],
  ['까나리', '🐟'], ['우럭', '🐟'], ['장어', '🐟'], ['붕어', '🐟'], ['생선', '🐟'],
  ['오징어채', '🦑'], ['오징어', '🦑'],
  ['쭈꾸미', '🐙'], ['주꾸미', '🐙'], ['낙지', '🐙'], ['문어', '🐙'],
  ['꽃게', '🦀'], ['게살', '🦀'], ['게', '🦀'],
  ['굴', '🦪'], ['바지락', '🦪'], ['홍합', '🦪'], ['조개', '🦪'], ['전복', '🐚'],
  ['해물', '🦐'], ['어묵', '🍢'], ['오뎅', '🍢'],
  ['회', '🍣'], ['숙회', '🍣'],
  // ── 해조류 ──
  ['미역', '🌿'], ['미역줄기', '🌿'], ['김자반', '🌿'], ['김무침', '🌿'],
  ['파래', '🌿'], ['톳', '🌿'], ['김', '🌿'],
  // ── 두부 / 콩 / 계란 ──
  // 두부는 전용 이모지가 없어 🥘(한식 스튜) 로 fallback — 두부조림·두부부침·순두부찌개 등에 어울림.
  ['연두부', '🥘'], ['순두부', '🍲'], ['두부조림', '🥘'], ['두부부침', '🥞'],
  ['마파두부', '🥘'], ['두부김치', '🥘'], ['두부', '🥘'], ['유부', '🥘'],
  ['콩나물', '🌱'], ['숙주', '🌱'],
  ['콩자반', '🫘'], ['검은콩', '🫘'], ['콩비지', '🫘'], ['청국장', '🍲'], ['콩', '🫘'],
  ['땅콩', '🥜'], ['아몬드', '🥜'], ['견과류', '🌰'], ['믹스넛', '🥜'],
  ['계란말이', '🥚'], ['계란찜', '🥚'], ['계란탕', '🥚'], ['스크램블', '🥚'],
  ['프라이', '🍳'], ['후라이', '🍳'], ['오믈렛', '🥚'],
  ['계란', '🥚'], ['달걀', '🥚'], ['에그', '🥚'], ['메추리알', '🥚'],
  // ── 유제품 / 디저트 ──
  ['우유', '🥛'], ['두유', '🥛'], ['요거트', '🥛'], ['요구르트', '🥛'],
  ['치즈', '🧀'], ['버터', '🧈'],
  ['아이스크림', '🍦'], ['젤리', '🍮'], ['푸딩', '🍮'], ['양갱', '🍮'], ['도토리묵', '🍮'],
  ['빙수', '🍧'], ['팥빙수', '🍧'], ['슬러시', '🥤'],
  // ── 빵 ──
  ['크로와상', '🥐'], ['크루아상', '🥐'], ['바게트', '🥖'], ['모닝빵', '🍞'],
  ['크림빵', '🍞'], ['단팥빵', '🍞'], ['소보로', '🍞'], ['카스테라', '🍞'], ['식빵', '🍞'],
  ['빵', '🍞'], ['토스트', '🍞'], ['머핀', '🧁'], ['컵케이크', '🧁'],
  ['케이크', '🍰'], ['쿠키', '🍪'], ['비스킷', '🍪'], ['초콜릿', '🍫'], ['초코', '🍫'],
  ['도넛', '🍩'], ['도너츠', '🍩'], ['슈크림', '🍩'],
  ['약과', '🍪'], ['한과', '🍪'], ['매작과', '🍪'], ['호두과자', '🍪'],
  ['호떡', '🥞'], ['붕어빵', '🥮'], ['월병', '🥮'],
  // ── 전 / 부침 ──
  ['해물파전', '🥞'], ['파전', '🥞'], ['김치전', '🥞'], ['감자전', '🥞'], ['녹두전', '🥞'],
  ['호박전', '🥞'], ['동태전', '🥞'], ['깻잎전', '🥞'], ['육전', '🥞'],
  ['전병', '🥞'], ['부침', '🥞'], ['지짐', '🥞'],
  ['전', '🥞'],  // 단일자 — 길이정렬로 위 긴 키워드들 뒤에서만 매치됨
  // ── 김치 / 절임 ──
  ['배추김치', '🥬'], ['포기김치', '🥬'], ['열무김치', '🥬'], ['깍두기', '🥬'],
  ['알타리', '🥬'], ['총각김치', '🥬'], ['백김치', '🥬'], ['파김치', '🥬'],
  ['겉절이', '🥗'], ['김치', '🥬'],
  ['단무지', '🟡'], ['오이지', '🥒'], ['장아찌', '🥒'], ['피클', '🥒'], ['짠지', '🥒'],
  // ── 샐러드 / 채소 ──
  ['샐러드', '🥗'], ['생채', '🥗'], ['상추', '🥗'], ['치커리', '🥗'], ['로메인', '🥗'],
  ['시금치', '🥬'], ['시래기', '🥬'], ['배추', '🥬'], ['양배추', '🥬'], ['청경채', '🥬'],
  ['아스파라거스', '🥬'],
  ['브로콜리', '🥦'], ['콜리플라워', '🥦'],
  ['부추', '🌿'], ['깻잎', '🌿'], ['미나리', '🌿'], ['쑥', '🌿'], ['대파', '🌿'],
  ['도라지', '🌿'], ['더덕', '🌿'], ['취나물', '🌿'], ['고사리', '🌿'], ['숙주나물', '🌱'],
  // ── 뿌리채소 ──
  ['감자조림', '🥔'], ['감자볶음', '🥔'], ['감자', '🥔'], ['연근', '🥔'],
  ['고구마', '🍠'], ['옥수수', '🌽'], ['우엉', '🥕'],
  ['양파', '🧅'], ['마늘', '🧄'], ['생강', '🫚'], ['당근', '🥕'],
  ['무말랭이', '🥕'], ['무생채', '🥕'], ['무나물', '🥕'], ['깍두기', '🥕'],
  ['무국', '🍲'], ['뭇국', '🍲'], ['무', '🥕'],
  // ── 버섯 ──
  ['표고버섯', '🍄'], ['느타리', '🍄'], ['새송이', '🍄'], ['팽이버섯', '🍄'],
  ['양송이', '🍄'], ['목이버섯', '🍄'], ['팽이', '🍄'], ['버섯', '🍄'],
  // ── 호박 / 가지 / 오이 ──
  ['단호박', '🎃'], ['애호박', '🥒'], ['호박', '🎃'],
  ['가지볶음', '🍆'], ['가지', '🍆'], ['오이무침', '🥒'], ['오이', '🥒'],
  ['토마토', '🍅'], ['방울토마토', '🍅'], ['파프리카', '🫑'], ['피망', '🫑'],
  ['고추장', '🌶️'], ['청양', '🌶️'], ['풋고추', '🌶️'], ['고추', '🌶️'],
  // ── 과일 ──
  ['수박', '🍉'], ['참외', '🍈'], ['멜론', '🍈'], ['사과', '🍎'], ['바나나', '🍌'],
  ['청포도', '🍇'], ['포도', '🍇'], ['딸기', '🍓'], ['블루베리', '🫐'],
  ['오렌지', '🍊'], ['자몽', '🍊'], ['귤', '🍊'], ['파인애플', '🍍'], ['복숭아', '🍑'],
  ['키위', '🥝'], ['망고', '🥭'], ['체리', '🍒'], ['홍시', '🍑'], ['단감', '🍑'],
  ['배추', '🥬'], ['배', '🍐'],
  ['레몬', '🍋'], ['라임', '🍋'], ['아보카도', '🥑'],
  // ── 음료 / 차 ──
  ['주스', '🧃'], ['오렌지주스', '🧃'], ['사과주스', '🧃'], ['포도주스', '🧃'],
  ['에이드', '🥤'], ['사이다', '🥤'], ['콜라', '🥤'], ['음료', '🥤'], ['미숫가루', '🥤'],
  ['수정과', '🍵'], ['식혜', '🍵'], ['녹차', '🍵'], ['보리차', '🍵'], ['옥수수차', '🍵'],
  ['모카', '☕'], ['커피', '☕'], ['차', '🍵'],
  // ── 국 / 탕 / 찌개 ──
  ['미역국', '🍲'], ['된장국', '🍲'], ['김치국', '🍲'], ['황태국', '🍲'], ['콩나물국', '🍲'],
  ['시래기국', '🍲'], ['우거지국', '🍲'], ['소고기뭇국', '🍲'], ['뭇국', '🍲'], ['미소국', '🍲'],
  ['육개장', '🍲'], ['갈비탕', '🍲'], ['삼계탕', '🍲'], ['설렁탕', '🍲'], ['곰탕', '🍲'],
  ['해장국', '🍲'], ['알탕', '🍲'], ['매운탕', '🍲'], ['지리', '🍲'],
  ['김치찌개', '🍲'], ['된장찌개', '🍲'], ['순두부찌개', '🍲'], ['부대찌개', '🍲'], ['청국장', '🍲'],
  ['전골', '🍲'], ['스튜', '🍲'],
  ['국', '🍲'], ['탕', '🍲'], ['찌개', '🍲'],
  // ── 조리법 / 양념 (일반 fallback) ──
  ['볶음', '🥘'], ['조림', '🥘'], ['찜', '🥘'], ['찌짐', '🥞'],
  ['구이', '🍳'], ['무침', '🥗'], ['숙주무침', '🥗'], ['초무침', '🥗'],
  ['양념', '🥄'], ['소스', '🥄'], ['드레싱', '🥄'], ['마요', '🥄'],
  ['굴소스', '🦪'], ['된장', '🥣'], ['간장', '🥢'],
  ['시럽', '🍯'], ['꿀', '🍯'], ['잼', '🍯'],
  // ── 견과류 / 곡물 ──
  ['호두', '🌰'], ['잣', '🌰'], ['밤', '🌰'], ['은행', '🌰'],
  ['해바라기씨', '🌻'], ['아몬드', '🌰'],
  ['참깨', '🌾'], ['들깨', '🌾'], ['깨', '🌾'],
  ['보리', '🌾'], ['귀리', '🌾'], ['현미', '🌾'], ['찹쌀', '🌾'], ['수수', '🌾'], ['쌀', '🌾'],
  // ── 시리얼 / 기타 ──
  ['시리얼', '🥣'], ['그래놀라', '🥣'], ['뮤즐리', '🥣'], ['오트밀', '🥣'],
  // ── 추가 키워드: 자연스러운 매칭 확장 (한식·일식·중식·양식·동남아·디저트) ──
  // 죽 변형
  ['들깨죽', '🥣'], ['흑임자죽', '🥣'], ['녹두죽', '🥣'], ['단호박죽', '🥣'],
  ['잣죽', '🥣'], ['깨죽', '🥣'], ['계란죽', '🥣'], ['오트밀죽', '🥣'],
  // 밥 변형
  ['강낭콩밥', '🌾'], ['완두콩밥', '🌾'], ['율무밥', '🌾'], ['기장밥', '🌾'],
  ['수수밥', '🌾'], ['팥밥', '🌾'], ['약식', '🍡'], ['찰밥', '🌾'],
  ['김치볶음밥', '🍚'], ['새우볶음밥', '🍚'], ['멸치볶음밥', '🍚'], ['낙지덮밥', '🍚'],
  ['오징어덮밥', '🍚'], ['제육덮밥', '🍚'], ['불고기덮밥', '🍚'], ['소고기덮밥', '🍚'],
  ['치킨덮밥', '🍚'], ['카레덮밥', '🍛'], ['짜장덮밥', '🍚'],
  // 일식
  ['텐동', '🍤'], ['카츠동', '🍖'], ['규동', '🥩'], ['오야꼬동', '🥚'], ['오야코동', '🥚'],
  ['차슈동', '🥩'], ['치라시', '🍣'], ['이나리', '🍣'], ['오니기리', '🍙'],
  ['라멘', '🍜'], ['미소라멘', '🍜'], ['돈코츠', '🍜'], ['소바', '🍜'], ['야끼소바', '🍜'],
  ['미고렝', '🍜'], ['팟타이', '🍜'], ['월남쌈', '🥗'], ['생춘권', '🥗'], ['춘권', '🥢'],
  // 중식
  ['마라탕', '🍲'], ['마라샹궈', '🥘'], ['양장피', '🥢'], ['류산슬', '🥘'],
  ['동파육', '🥩'], ['양꼬치', '🍢'], ['칠리새우', '🍤'],
  // 면 변형
  ['콩국수', '🍜'], ['들깨국수', '🍜'], ['메밀국수', '🍜'], ['메밀면', '🍜'],
  ['소면', '🍜'], ['비빔메밀', '🍜'], ['막국수', '🍜'], ['치즈라면', '🍜'],
  ['비빔라면', '🍜'], ['해물칼국수', '🍜'], ['바지락칼국수', '🍜'],
  // 전 변형 (긴 키워드 먼저)
  ['두부전', '🥞'], ['햄전', '🥞'], ['맛살전', '🥞'], ['버섯전', '🥞'],
  ['굴전', '🥞'], ['새우전', '🥞'], ['명태전', '🥞'], ['북어전', '🥞'],
  ['대구전', '🥞'], ['청양고추전', '🥞'], ['고추전', '🥞'],
  // 고기/요리 변형
  ['소갈비', '🥩'], ['돼지갈비', '🥩'], ['훈제오리', '🦆'], ['훈제', '🥓'],
  ['소불고기', '🥩'], ['돼지불고기', '🥩'], ['닭불고기', '🍗'], ['닭볶음', '🍗'],
  ['닭조림', '🍗'], ['닭튀김', '🍗'], ['치즈불고기', '🥩'], ['치즈돈가스', '🍖'],
  ['청양제육', '🥩'], ['주꾸미볶음', '🐙'], ['낙지볶음', '🐙'], ['오징어볶음', '🦑'],
  ['소떡소떡', '🍢'], ['닭꼬치', '🍗'], ['육포', '🥩'], ['LA갈비찜', '🥩'],
  // 해산물 변형
  ['갑오징어', '🦑'], ['한치', '🦑'], ['문어숙회', '🐙'], ['꼴뚜기', '🦑'],
  ['뱅어포', '🐟'], ['쥐치', '🐟'], ['도미', '🐟'], ['광어', '🐟'],
  ['농어', '🐟'], ['대구탕', '🍲'], ['대구살', '🐟'], ['꽁치', '🐟'],
  ['청어', '🐟'], ['참치마요', '🐟'], ['참치김치찌개', '🍲'], ['참치김밥', '🍙'], ['참치', '🐟'],
  ['날치알', '🍣'], ['명란젓', '🐟'], ['명란', '🐟'], ['창란젓', '🐟'],
  ['오징어순대', '🦑'], ['새우완자', '🍤'],
  // 나물 / 채소 변형
  ['시금치나물', '🥬'], ['콩나물무침', '🌱'], ['숙주나물무침', '🌱'],
  ['미나리무침', '🌿'], ['취나물무침', '🌿'], ['깻잎무침', '🌿'],
  ['도라지무침', '🌿'], ['오이생채', '🥒'], ['청경채볶음', '🥬'],
  ['브로콜리무침', '🥦'], ['아스파라거스볶음', '🥬'], ['연근조림', '🥔'],
  ['우엉조림', '🥕'], ['우엉채', '🥕'], ['연근튀김', '🥔'],
  ['감자튀김', '🍟'], ['프렌치프라이', '🍟'], ['웨지감자', '🥔'],
  // 샐러드 / 양식
  ['코울슬로', '🥗'], ['시저샐러드', '🥗'], ['그릭샐러드', '🥗'],
  ['카프레제', '🥗'], ['파스타샐러드', '🥗'], ['연어샐러드', '🥗'], ['닭가슴살샐러드', '🥗'],
  ['콘샐러드', '🌽'], ['감자샐러드', '🥔'], ['마카로니샐러드', '🥗'],
  // 양식 메인
  ['리코타', '🧀'], ['치즈피자', '🍕'], ['페퍼로니', '🍕'], ['고르곤졸라', '🍕'],
  ['트러플', '🍕'], ['리조또', '🍚'], ['뇨끼', '🍝'], ['라자냐', '🍝'], ['까르보나라', '🍝'],
  ['알리오올리오', '🍝'], ['봉골레', '🍝'], ['오일파스타', '🍝'], ['토마토파스타', '🍝'],
  // 디저트 / 빵 추가
  ['베이글', '🥯'], ['치아바타', '🍞'], ['브리오슈', '🍞'], ['프레첼', '🥨'],
  ['스콘', '🍞'], ['에그타르트', '🥧'], ['타르트', '🥧'], ['마카롱', '🍪'],
  ['마들렌', '🍪'], ['피낭시에', '🍪'], ['브라우니', '🍫'], ['치즈케이크', '🍰'],
  ['에끌레르', '🍩'], ['와플', '🧇'], ['팬케이크', '🥞'], ['크레페', '🥞'],
  ['타피오카', '🧋'], ['버블티', '🧋'], ['밀크티', '🧋'],
  // 떡 / 한과 변형
  ['꿀떡', '🍡'], ['경단', '🍡'], ['꽃떡', '🍡'], ['찹쌀도넛', '🍩'],
  // 과일 변형
  ['한라봉', '🍊'], ['천혜향', '🍊'], ['레드향', '🍊'], ['황금향', '🍊'],
  ['망고스틴', '🥭'], ['용과', '🍐'], ['두리안', '🥭'], ['리치', '🍒'],
  ['살구', '🍑'], ['자두', '🍑'], ['거봉', '🍇'], ['샤인머스캣', '🍇'],
  ['석류', '🍎'], ['무화과', '🍐'], ['감', '🍑'],
  // 음료 / 차 변형
  ['아이스티', '🧊'], ['복숭아아이스티', '🧊'], ['레모네이드', '🥤'], ['레몬에이드', '🥤'],
  ['자몽에이드', '🥤'], ['청포도에이드', '🥤'], ['유자차', '🍵'], ['매실차', '🍵'],
  ['둥굴레차', '🍵'], ['복분자', '🍇'], ['오미자', '🍒'], ['오미자차', '🍵'],
  // 한식 반찬 보충
  ['갈치조림', '🐟'], ['고등어조림', '🐟'], ['삼치조림', '🐟'], ['임연수조림', '🐟'],
  ['장조림', '🥩'], ['소고기장조림', '🥩'], ['진미채볶음', '🐟'], ['멸치볶음', '🐟'],
  ['어묵볶음', '🍢'], ['소시지볶음', '🌭'], ['감자채볶음', '🥔'], ['감자조림', '🥔'],
  ['깻잎장아찌', '🥒'], ['오이장아찌', '🥒'], ['마늘장아찌', '🧄'], ['고추장아찌', '🌶️'],
  // 김 / 김치 변형
  ['김자반', '🌿'], ['김부각', '🌿'], ['돌김', '🌿'], ['조미김', '🌿'],
  ['파래김', '🌿'], ['김가루', '🌿'], ['갓김치', '🥬'], ['부추김치', '🌿'],
  ['배추겉절이', '🥗'], ['열무겉절이', '🥗'], ['오이김치', '🥒'],
  // 쌈 / 채소
  ['쌈무', '🥬'], ['쌈장', '🥄'], ['쌈채소', '🥬'], ['양상추쌈', '🥬'],
  // 기타
  ['컵라면', '🍜'], ['컵밥', '🍚'], ['삼각김밥', '🍙'], ['주먹밥', '🍙'],
  ['수란', '🥚'], ['반숙', '🥚'], ['훈제계란', '🥚'], ['장조림계란', '🥚'],
  ['모짜렐라', '🧀'], ['리코타치즈', '🧀'], ['체다', '🧀'], ['파마산', '🧀'],
  ['생크림', '🥛'], ['휘핑', '🥛'], ['연유', '🥛'],
  ['깐풍기', '🍗'], ['난자완스', '🍖'], ['깐풍육', '🍖'],
  ['양념게장', '🦀'], ['간장게장', '🦀'],
  ['육회', '🥩'], ['육사시미', '🥩'], ['타다끼', '🥩'],
  // ── ★ False-Positive 차단 (명시 등록으로 substring 매칭 회피) ──
  // 길이 우선 정렬이라 명시 등록된 긴 키워드가 먼저 매칭됨.
  ['회오리감자', '🥔'], ['회오리', '🥔'],  // "회오리"의 "오리" → 🦆 차단
  ['새우깡', '🍤'], ['새우과자', '🍤'],
  ['오리고기', '🦆'], ['오리불고기', '🦆'], ['오리주물럭', '🦆'], ['오리훈제', '🦆'], ['오리로스', '🦆'],
  ['전어구이', '🐟'], ['전어회', '🐟'], ['전어', '🐟'],  // "전어"의 "전" → 🥞 차단
  ['깐풍감자', '🥔'],
  ['감자고로케', '🥔'], ['고로케', '🍖'], ['크로켓', '🍖'],
  ['고기감자조림', '🥩'], ['소고기감자조림', '🥩'],
  // ── ★ 한국 급식 자주 나오는 메뉴 보강 ──
  // 분식 / 길거리
  ['치즈스틱', '🧀'], ['치즈볼', '🧀'], ['치즈스티커', '🧀'],
  ['찹쌀탕수육', '🍖'], ['찹쌀꿔바로우', '🍖'], ['꿔바로우', '🍖'],
  ['바삭', '🍖'], ['바사삭', '🍖'],
  ['양념감자', '🥔'], ['허니버터감자', '🥔'], ['치즈감자', '🥔'], ['통감자', '🥔'],
  ['고구마맛탕', '🍠'], ['맛탕', '🍠'], ['고구마튀김', '🍠'], ['고구마스틱', '🍠'],
  // 한식 반찬 더
  ['장조림계란', '🥚'], ['메추리알장조림', '🥚'], ['알장조림', '🥚'],
  ['깻잎지', '🌿'], ['깻잎김치', '🌿'], ['들깻잎', '🌿'],
  ['콩잎', '🌿'], ['콩잎김치', '🌿'],
  ['김자반볶음', '🌿'], ['김무침', '🌿'],
  ['멸치꽈리고추', '🐟'], ['꽈리고추', '🌶️'], ['꽈리고추멸치', '🐟'],
  ['오징어진미채', '🦑'], ['진미채', '🐟'], ['황태채', '🐟'], ['북어채', '🐟'], ['북어무침', '🐟'],
  // 국 / 탕 보강
  ['닭개장', '🍲'], ['닭곰탕', '🍲'], ['들깨미역국', '🍲'], ['들깨수제비', '🍜'],
  ['시래기된장국', '🍲'], ['우거지된장국', '🍲'], ['우거지갈비탕', '🍲'],
  ['황태해장국', '🍲'], ['콩나물해장국', '🍲'],
  ['만두국', '🥟'], ['만둣국', '🥟'], ['떡만둣국', '🥟'], ['수제비국', '🍜'],
  ['어묵국', '🍲'], ['어묵탕', '🍲'], ['오뎅탕', '🍲'],
  ['김치국밥', '🍲'], ['콩나물국밥', '🍲'], ['소고기국밥', '🍲'],
  ['수육국밥', '🍲'], ['돼지국밥', '🍲'],
  ['닭개장국', '🍲'], ['육개장국', '🍲'],
  ['추어탕', '🍲'], ['보신탕', '🍲'], ['민어탕', '🍲'],
  // 면 보충
  ['짜장밥', '🍚'], ['짬뽕밥', '🍚'], ['우동국물', '🍜'],
  ['해물우동', '🍜'], ['고기우동', '🍜'], ['카레우동', '🍜'],
  ['김치우동', '🍜'], ['튀김우동', '🍜'],
  // 양식 보충
  ['오믈렛라이스', '🍳'], ['오므라이스', '🍳'],
  ['그라탕', '🧀'], ['그라탱', '🧀'], ['도리아', '🍚'],
  ['리조토', '🍚'], ['포카치아', '🍞'], ['포카챠', '🍞'],
  ['프렌치토스트', '🍞'], ['에그샌드위치', '🥪'], ['햄샌드위치', '🥪'],
  ['클럽샌드위치', '🥪'], ['BLT', '🥪'],
  // 고기 보충
  ['닭다리', '🍗'], ['닭봉', '🍗'], ['닭윙', '🍗'], ['닭날개', '🍗'],
  ['닭가슴살', '🍗'], ['닭안심', '🍗'], ['닭허벅살', '🍗'],
  ['양념닭갈비', '🍗'], ['숯불닭갈비', '🍗'], ['치즈닭갈비', '🍗'],
  ['LA갈비', '🥩'], ['LA갈비찜', '🥩'], ['생갈비', '🥩'], ['양념갈비', '🥩'], ['소갈비찜', '🥩'],
  ['돼지갈비찜', '🥩'], ['돼지불고기', '🥩'], ['언양식불고기', '🥩'],
  ['너비아니', '🥩'], ['너비아니구이', '🥩'], ['장조림', '🥩'],
  ['수육', '🥩'], ['편육', '🥩'], ['족발', '🥩'],
  ['치즈돈가스', '🍖'], ['카레돈가스', '🍖'], ['치즈까스', '🍖'], ['치킨까스', '🍖'],
  ['생선까스', '🐟'], ['생선가스', '🐟'], ['생선튀김', '🐟'],
  // 해산물 보충
  ['깐쇼새우', '🍤'], ['감바스', '🍤'], ['새우버터구이', '🍤'],
  ['오징어튀김', '🦑'], ['오징어강정', '🦑'], ['오징어초무침', '🦑'],
  ['주꾸미볶음', '🐙'], ['낙지볶음', '🐙'], ['낙지덮밥', '🐙'],
  ['아구찜', '🍲'], ['아귀찜', '🍲'], ['해물찜', '🍲'],
  // 채소 / 나물 보충
  ['시금치된장무침', '🥬'], ['고사리나물', '🌿'], ['고사리들깨', '🌿'],
  ['취나물볶음', '🌿'], ['도라지나물', '🌿'], ['도라지생채', '🌿'],
  ['오이부추무침', '🥒'], ['미나리오이무침', '🥒'],
  ['숙주미나리무침', '🌱'], ['콩나물잡채', '🌱'],
  // 김치 보충
  ['김치볶음', '🥬'], ['묵은지', '🥬'], ['묵은지볶음', '🥬'], ['묵은지찜', '🥬'],
  ['보쌈김치', '🥬'], ['겉절이김치', '🥗'],
  // 떡 / 분식
  ['치즈떡볶이', '🍜'], ['로제떡볶이', '🍜'], ['궁중떡볶이', '🍡'], ['간장떡볶이', '🍜'],
  ['소떡소떡', '🍢'], ['모듬꼬치', '🍢'], ['닭꼬치', '🍗'],
  // 음료 추가
  ['요플레', '🥛'], ['액티비아', '🥛'], ['바나나우유', '🥛'], ['딸기우유', '🥛'],
  ['초코우유', '🥛'], ['커피우유', '🥛'], ['멜론우유', '🥛'],
  ['ABC주스', '🧃'], ['혼합주스', '🧃'],
  // 빵 추가
  ['치즈빵', '🍞'], ['단호박빵', '🍞'], ['옥수수빵', '🍞'], ['땅콩빵', '🍞'],
  ['모카빵', '🍞'], ['찐빵', '🥟'], ['호빵', '🥟'],
  ['카스테라', '🍞'], ['파운드', '🍰'], ['시폰', '🍰'],
  // ── 가장 짧은 매칭 (다른 키워드 모두 시도 후) ──
  ['밥', '🍚'],
]

// ★ 모듈 로드 시 한 번만 길이 내림차순으로 정렬. 짧은 키워드가 긴 키워드를 가로채는
//   false-positive 차단. (예: "어"(1) 보다 "오징어"(3) 가 먼저 검사돼야 🦑 가 나옴)
//   같은 길이일 때는 array 정의 순서 유지(stable sort).
const MEAL_EMOJI_MAP_SORTED: ReadonlyArray<readonly [string, string]> =
  [...MEAL_EMOJI_MAP].sort((a, b) => b[0].length - a[0].length)

/** 메뉴명에 어울리는 이모지. 매칭 안 되면 식판 느낌의 도시락(🍱)으로 fallback. */
function pickEmoji(name: string): string {
  for (const [kw, emoji] of MEAL_EMOJI_MAP_SORTED) {
    if (name.includes(kw)) return emoji
  }
  return '🍱'  // fallback — 식판/도시락 느낌. 줄맞춤 + 미관 유지.
}

function loadCache(): MealCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as MealCache
  } catch { return null }
}
function saveCache(c: MealCache): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch { /* noop */ }
}

function loadConfig(): MealConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as MealConfig
  } catch { /* noop */ }
  return { school: null }
}
function saveConfig(c: MealConfig): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)) } catch { /* noop */ }
}

function todayYmd(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const MEAL_ORDER: Record<string, number> = { '조식': 0, '중식': 1, '석식': 2 }
function sortMeals(meals: MealMenu[]): MealMenu[] {
  return [...meals].sort((a, b) => (MEAL_ORDER[a.mealType] ?? 9) - (MEAL_ORDER[b.mealType] ?? 9))
}

export function MealWidget() {
  const [config, setConfig] = useState<MealConfig>(() => loadConfig())
  const [meals, setMeals] = useState<MealMenu[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)

  // 학교 검색 모달
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<NeisSchool[]>([])
  const [searching, setSearching] = useState(false)

  // 디스플레이/배경화면 모드
  const [displayMode, setDisplayMode] = useState(false)
  const iAmWallpaper = useIAmWallpaper('meal')
  const { preset: displayBg } = useDisplayBg('meal')
  const myWidgetId = useRef<string>('widget-meal')

  // wallpaper / 마스터 디스플레이 모드 sync
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const map = await window.api.widget.getWallpaperModeMap()
        if (!cancelled && Array.isArray(map) && map.includes(myWidgetId.current)) setDisplayMode(true)
      } catch { /* noop */ }
    })()
    const offWallpaper = window.api.widget.onWallpaperModeChanged?.((p) => {
      if (p.widgetId !== myWidgetId.current) return
      // wallpaper ON 시에만 displayMode 자동 ON. OFF 는 sync 안 함 — 끄기 버튼 한 번에 풀리도록.
      if (p.on) setDisplayMode(true)
    })
    const offAll = window.api.widget.onAllDisplayModeChanged?.((p) => {
      setDisplayMode(!!p.on)
    })
    return () => {
      cancelled = true
      if (offWallpaper) offWallpaper()
      if (offAll) offAll()
    }
  }, [])
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('widget:displayMode', { detail: { on: displayMode } }))
  }, [displayMode])

  const reload = useCallback(async () => {
    if (!config.school) return
    const today = todayYmd()
    const schoolCode = config.school.schoolCode

    // ① 캐시 hit — 같은 학교, 같은 날짜면 호출 안 함 (NEIS API 부하 절감 → 무인증 풀에서도 1만명 동시 사용 가능).
    const cached = loadCache()
    if (cached && cached.schoolCode === schoolCode && cached.ymd === today) {
      setMeals(cached.meals)
      const lunchIdx = cached.meals.findIndex((x) => x.mealType === '중식')
      setActiveIdx(lunchIdx >= 0 ? lunchIdx : 0)
      if (cached.meals.length === 0) setError('오늘은 급식이 없어요')
      else setError(null)
      return
    }

    // ② 캐시 miss — 호출 + 저장
    setLoading(true)
    setError(null)
    try {
      const m = await window.api.meal.fetchToday(
        config.school.scCode, schoolCode, today, config.apiKey,
      )
      const sorted = sortMeals(m)
      setMeals(sorted)
      saveCache({ schoolCode, ymd: today, meals: sorted, fetchedAt: Date.now() })
      const lunchIdx = sorted.findIndex((x) => x.mealType === '중식')
      setActiveIdx(lunchIdx >= 0 ? lunchIdx : 0)
      if (sorted.length === 0) setError('오늘은 급식이 없어요')
    } catch {
      // 네트워크 실패 — stale 캐시(어제·이전)라도 같은 학교면 표시.
      if (cached && cached.schoolCode === schoolCode) {
        setMeals(cached.meals)
        setError('네트워크 오류 — 캐시된 정보 표시 중')
      } else {
        setError('급식을 불러오지 못했어요')
      }
    } finally {
      setLoading(false)
    }
  }, [config.school, config.apiKey])

  useEffect(() => { reload() }, [reload])
  // 자정 넘기면 자동 갱신 — 24시간 1회 (학교 PC가 종일 켜져 있을 때만 의미. 일반적으론 mount 시
  // reload + ymd 캐시 비교로 충분). 6시간 → 24시간으로 늘려 Worker 호출 절약.
  useEffect(() => {
    const t = setInterval(() => { reload() }, 24 * 60 * 60 * 1000)
    return () => clearInterval(t)
  }, [reload])

  const search = async (): Promise<void> => {
    if (!searchTerm.trim()) return
    setSearching(true)
    try {
      // Cloudflare Worker 가 NEIS 인증키 보유. 사용자가 키 입력할 필요 없음.
      const r = await window.api.meal.searchSchool(searchTerm.trim())
      setSearchResults(r)
    } finally { setSearching(false) }
  }
  const selectSchool = (school: NeisSchool): void => {
    const next: MealConfig = { ...config, school }
    setConfig(next)
    saveConfig(next)
    setSearchOpen(false)
    setSearchTerm('')
    setSearchResults([])
  }
  const clearSchool = (): void => {
    const next: MealConfig = { ...config, school: null }
    setConfig(next)
    saveConfig(next)
    setMeals([])
  }

  const isLightText = displayBg.textMode === 'light'
  const rootBg = displayMode && displayBg.bg
    ? displayBg.bg
    : 'radial-gradient(ellipse at 80% 0%, rgba(245,158,11,0.10) 0%, transparent 55%), radial-gradient(ellipse at 0% 100%, rgba(244,114,182,0.06) 0%, transparent 50%)'

  // ─── 학교 미설정 — 첫 사용 안내 ───
  if (!config.school && !searchOpen) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-center"
        style={{ padding: 'clamp(14px, 2.4vw, 28px)' }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
            color: '#fff', boxShadow: '0 8px 22px rgba(245,158,11,0.42)',
            marginBottom: 12,
          }}
        >
          <Utensils strokeWidth={2.2} size={26} />
        </div>
        <p className="text-sm font-bold text-[var(--text-primary)] mb-1">오늘의 급식</p>
        <p className="text-[11px] text-[var(--text-muted)] mb-3 leading-relaxed">
          학교를 선택하면 매일 자동으로 급식이 나와요
        </p>
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center justify-center gap-1.5 text-xs font-semibold transition-transform hover:scale-[1.02]"
          style={{
            padding: '10px 18px', borderRadius: 10,
            backgroundColor: '#F59E0B', color: '#fff',
            boxShadow: '0 4px 12px rgba(245,158,11,0.36)',
          }}
        >
          <Search size={13} strokeWidth={2.4} /> 학교 검색하기
        </button>
      </div>
    )
  }

  // ─── 학교 검색 모달 ───
  if (searchOpen) {
    return (
      <div className="flex flex-col h-full" style={{ padding: '14px 16px' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-[var(--text-primary)]">학교 검색</span>
          <button
            onClick={() => setSearchOpen(false)}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <input
            autoFocus
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="학교명 (예: 서울초등학교)"
            className="flex-1 text-xs bg-[var(--bg-secondary)] rounded-md px-2.5 py-1.5 outline-none text-[var(--text-primary)]"
          />
          <button
            onClick={search}
            disabled={!searchTerm.trim() || searching}
            className="shrink-0 flex items-center justify-center hover:opacity-85 disabled:opacity-40"
            style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#F59E0B', color: '#fff' }}
          >
            {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} strokeWidth={2.4} />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {searchResults.length === 0 ? (
            <p className="text-[11px] text-[var(--text-muted)] text-center py-6">
              {searchTerm.trim() ? '검색 결과가 없어요. 정확한 학교명으로 다시 시도해 주세요.' : '학교명을 입력하고 검색해 보세요'}
            </p>
          ) : (
            <ul className="space-y-1">
              {searchResults.map((s) => (
                <li key={`${s.scCode}-${s.schoolCode}`}>
                  <button
                    onClick={() => selectSchool(s)}
                    className="w-full text-left transition-colors hover:bg-[var(--bg-secondary)]"
                    style={{ padding: '8px 10px', borderRadius: 8 }}
                  >
                    <div className="text-[11px] font-semibold text-[var(--text-primary)]">{s.name}</div>
                    {s.address && (
                      <div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
                        {s.type ? `${s.type} · ` : ''}{s.address}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  // ─── 정상 표시 ───
  const active = meals[activeIdx]

  return (
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        // containerType: size → cqmin 단위가 위젯 크기에 비례 → 박스 줄여도 텍스트가 같이 줄어 잘림 방지
        containerType: 'size',
        // 배경화면 모드: 컨트롤 숨겨져 여백 헛공간 → 위아래 padding 축소
        padding: iAmWallpaper
          ? 'clamp(8px, 2cqmin, 14px) clamp(12px, 3cqmin, 20px)'
          : 'clamp(12px, 2.5cqmin, 22px) clamp(16px, 3cqmin, 26px) clamp(14px, 3cqmin, 24px)',
        background: rootBg,
        transition: 'background 320ms ease',
        color: isLightText ? '#fff' : undefined,
      }}
    >
      {displayMode && displayBg.glow && (
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: displayBg.glow }} />
      )}

      {/* 우상단 컨트롤 — 일반 모드 진입 토글만. 디스플레이 모드에선 본문 칼로리 라인에 inline. */}
      {!iAmWallpaper && !displayMode && (
        <div
          className="absolute top-2 right-2 z-50 flex items-center gap-1.5"
          style={{ WebkitAppRegion: 'no-drag', pointerEvents: 'auto' } as React.CSSProperties}
        >
          <button
            onClick={() => {
              const next = !displayMode
              setDisplayMode(next)
              try { window.api.widget.setAllDisplayMode?.(next) } catch { /* noop */ }
            }}
            className="rounded-lg transition-all flex items-center justify-center hover:scale-105"
            style={displayMode
              ? {
                  width: 32,
                  height: 32,
                  color: isLightText ? '#fff' : 'var(--accent)',
                  background: isLightText ? 'rgba(255,255,255,0.18)' : 'var(--accent-light)',
                  border: isLightText ? '1.5px solid rgba(255,255,255,0.42)' : '1.5px solid rgba(37,99,235,0.28)',
                  boxShadow: isLightText ? '0 4px 12px rgba(0,0,0,0.25)' : '0 4px 12px rgba(37,99,235,0.18)',
                  backdropFilter: 'blur(10px)',
                }
              : {
                  width: 26,
                  height: 26,
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-widget)',
                  background: 'transparent',
                }
            }
            title={displayMode ? '디스플레이 모드 해제 (모든 위젯 동기)' : '디스플레이 모드'}
          >
            {displayMode ? <MonitorOff size={16} strokeWidth={2.4} /> : <Monitor size={13} strokeWidth={2.2} />}
          </button>
          {!displayMode && (
            <button
              onClick={() => { setApiKeyDraft(config.apiKey ?? ''); setSearchOpen(true) }}
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
              title="학교 변경"
            >
              <Settings size={13} strokeWidth={2.2} />
            </button>
          )}
        </div>
      )}

      {/* 헤더 — 학교명 + 날짜. 배경모드에선 학교명만 작게 → mb-1 로 축소 (mb-3 누적되어 위쪽 공간 과다). */}
      <div className={`flex items-center gap-2.5 shrink-0 ${iAmWallpaper ? 'mb-1' : 'mb-3'}`} style={{ paddingRight: !iAmWallpaper ? 76 : 0 }}>
        <span
          className="flex items-center justify-center shrink-0"
          style={{
            width: 30, height: 30, borderRadius: 9,
            background: isLightText ? 'rgba(255,255,255,0.18)' : 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
            color: '#fff', boxShadow: isLightText ? 'none' : '0 4px 12px rgba(245,158,11,0.32)',
          }}
        >
          <Utensils size={16} strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="truncate"
            style={{
              fontSize: 'clamp(14px, 3.4cqmin, 19px)', fontWeight: 800, letterSpacing: '-0.02em',
              color: isLightText ? '#fff' : 'var(--text-primary)',
            }}
          >
            {config.school?.name ?? ''}
          </div>
          <div
            className="text-[10px]"
            style={{ color: isLightText ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)' }}
          >
            {todayYmd().replace(/-/g, '.')}
          </div>
        </div>
      </div>

      {/* 식사 탭 (조식/중식/석식) */}
      {meals.length > 1 && (
        <div className="flex items-center gap-1 mb-2 shrink-0">
          {meals.map((m, i) => (
            <button
              key={m.mealType + i}
              onClick={() => setActiveIdx(i)}
              className="text-[11px] font-semibold transition-colors"
              style={{
                padding: '4px 10px', borderRadius: 999,
                backgroundColor: i === activeIdx
                  ? (isLightText ? 'rgba(255,255,255,0.22)' : '#F59E0B')
                  : (isLightText ? 'rgba(255,255,255,0.08)' : 'var(--bg-secondary)'),
                color: i === activeIdx
                  ? (isLightText ? '#fff' : '#fff')
                  : (isLightText ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)'),
              }}
            >
              {m.mealType}
            </button>
          ))}
        </div>
      )}

      {/* 본문 — 디스플레이 모드면 콘텐츠를 세로 중앙 정렬해 하단 빈 공간 제거. */}
      <div
        className="flex-1 overflow-y-auto"
        style={displayMode ? { display: 'flex', flexDirection: 'column', justifyContent: 'center' } : undefined}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={20} className="animate-spin text-[var(--text-muted)]" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <AlertCircle size={20} className="text-[var(--text-muted)]" />
            <p className="text-[11px] text-[var(--text-muted)]">{error}</p>
          </div>
        ) : active ? (
          <AnimatePresence mode="wait">
            <motion.ul
              key={active.mealType + active.date}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{
                display: 'grid',
                // 한 줄에 2개씩 — 폭이 좁아지면 1열로 자동 fallback.
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 'clamp(6px, 1vw, 12px)',
              }}
            >
              {active.dishes.map((dish, i) => {
                const emoji = pickEmoji(dish)
                return (
                  <li
                    key={i}
                    style={{
                      // cqmin 으로 위젯 크기에 비례 → 박스 줄여도 글씨도 같이 줄어 잘림 방지. 사용자 요청으로 가독성 ↑.
                      fontSize: 'clamp(15px, 5.4cqmin, 28px)',
                      fontWeight: 700,
                      color: isLightText ? '#fff' : 'var(--text-primary)',
                      padding: 'clamp(6px, 2cqmin, 14px) clamp(8px, 2.6cqmin, 16px)',
                      borderRadius: 10,
                      background: isLightText ? 'rgba(255,255,255,0.12)' : 'rgba(245,158,11,0.08)',
                      borderLeft: `3px solid ${isLightText ? 'rgba(255,255,255,0.5)' : '#F59E0B'}`,
                      letterSpacing: '-0.015em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'clamp(4px, 1.4cqmin, 10px)',
                      lineHeight: 1.25,
                      wordBreak: 'keep-all',
                      overflowWrap: 'break-word',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        fontSize: 'clamp(18px, 6.4cqmin, 34px)',
                        flexShrink: 0,
                        lineHeight: 1,
                      }}
                    >
                      {emoji}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>{dish}</span>
                  </li>
                )
              })}
              {(active.calInfo || (displayMode && !iAmWallpaper)) && (
                <li
                  style={{
                    gridColumn: '1 / -1',
                    fontSize: '10.5px',
                    color: isLightText ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 8,
                    marginTop: 2,
                  }}
                >
                  {/* 디스플레이 모드 해제 버튼 — 칼로리 표시 왼쪽 inline (사용자 요청). */}
                  {displayMode && !iAmWallpaper && (
                    <button
                      onClick={() => {
                        setDisplayMode(false)
                        try { window.api.widget.setAllDisplayMode?.(false) } catch { /* noop */ }
                      }}
                      className="rounded-lg transition-all flex items-center justify-center hover:scale-105"
                      style={{
                        width: 24,
                        height: 24,
                        color: isLightText ? '#fff' : 'var(--accent)',
                        background: isLightText ? 'rgba(255,255,255,0.18)' : 'var(--accent-light)',
                        border: isLightText ? '1.5px solid rgba(255,255,255,0.42)' : '1.5px solid rgba(37,99,235,0.28)',
                        boxShadow: isLightText ? '0 3px 9px rgba(0,0,0,0.22)' : '0 3px 9px rgba(37,99,235,0.16)',
                        backdropFilter: 'blur(10px)',
                      } as React.CSSProperties}
                      title="디스플레이 모드 해제 (모든 위젯 동기)"
                    >
                      <MonitorOff size={12} strokeWidth={2.4} />
                    </button>
                  )}
                  <span>{active.calInfo}</span>
                </li>
              )}
            </motion.ul>
          </AnimatePresence>
        ) : null}
      </div>
    </div>
  )
}
