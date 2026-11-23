"""그림 상징 카드(직접 그린 선 그림) — 연구소가 수업에서 쓰는 그림 카드 방식을 화면으로 옮긴 것.
   특정 상징 체계의 그림을 가져오지 않고 모두 새로 그렸다. card('fries', '감자튀김') 처럼 쓴다."""
S = dict(
    fries='<path d="M14 22h20l-3 18H17z"/><path d="M17 22l-1-10 4 1 1 9M22 22l1-13 4 .5-.5 12.500M28 22l2-9 3.500 1.500L32 22"/>',
    pizza='<path d="M9 14c9-5 21-5 30 0L24 41z"/><path d="M12.500 18.500c7.500-3.500 15.500-3.500 23 0"/><circle cx="20" cy="25" r="1.800"/><circle cx="27" cy="23" r="1.800"/><circle cx="24" cy="31" r="1.800"/>',
    ketchup='<path d="M21 8h6v5h-6z"/><path d="M19 13h10l2 7v19a2 2 0 0 1-2 2H19a2 2 0 0 1-2-2V20z"/><path d="M17 26h14v7H17z"/>',
    cheese='<path d="M7 30L30 12l11 18v8H7z"/><path d="M7 30h34"/><circle cx="17" cy="35" r="1.500"/><circle cx="29" cy="24" r="2"/><circle cx="31" cy="34.500" r="1.500"/>',
    fryer='<path d="M14 16a10 10 0 0 1 20 0v20a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z"/><circle cx="24" cy="18" r="3.500"/><path d="M14 27h20M21 33h6"/>',
    oven='<rect x="9" y="9" width="30" height="31" rx="3"/><path d="M9 17h30"/><rect x="14" y="22" width="20" height="13" rx="2"/><path d="M14 13h.01M19 13h.01M33 13h.01"/>',
    make='<path d="M8 23h32a16 16 0 0 1-32 0z"/><path d="M30 23L38 8M18 41h12"/>',
    putin='<path d="M10 24v14a2 2 0 0 0 2 2h24a2 2 0 0 0 2-2V24"/><path d="M24 7v22M16 21l8 8 8-8"/>',
    wait='<circle cx="24" cy="25" r="15"/><path d="M24 16v9l6 4M19 6h10"/>',
    takeout='<path d="M10 24v14a2 2 0 0 0 2 2h24a2 2 0 0 0 2-2V24"/><path d="M24 30V8M16 16l8-8 8 8"/>',
    plate='<ellipse cx="24" cy="31" rx="17" ry="8"/><ellipse cx="24" cy="30" rx="9" ry="3.500"/><path d="M24 6v13M19 14l5 5 5-5"/>',
    give='<path d="M6 30c5-3 9-3 13 0l8 1c2 0 3 1 3 2.500S29 36 27 36h-7"/><path d="M30 33l9-4c2-1 4 0 4 2s-1 3-3 4l-12 6c-3 1-6 1-9 0L6 38"/>',
    eat='<path d="M15 7v10a4 4 0 0 0 8 0V7M19 7v34"/><path d="M33 41V7c-4 3-6 8-6 14v5h6"/>',
    yummy='<circle cx="24" cy="24" r="17"/><path d="M17 20h.01M31 20h.01"/><path d="M15 27c2 5 6 7 9 7s7-2 9-7z"/><path d="M24 34v-4"/>',
    hot='<path d="M24 6c2 7 10 10 10 20a10 10 0 0 1-20 0c0-4 2-6 4-9 1 3 2 4 4 5-1-6 0-11 2-16z"/><path d="M24 39a4 4 0 0 0 4-4c0-3-3-4-4-7-1 3-4 4-4 7a4 4 0 0 0 4 4z"/>',
    fork='<path d="M18 7v9a6 6 0 0 0 12 0V7M24 7v34"/>',
    tongs='<path d="M16 7c-2 12 0 22 6 33M32 7c2 12 0 22-6 33"/><path d="M19 9c3 2 7 2 10 0"/>',
    dish='<ellipse cx="24" cy="26" rx="18" ry="10"/><ellipse cx="24" cy="25" rx="10" ry="4.500"/>',
    cookie='<circle cx="24" cy="24" r="16"/><path d="M18 18h.01M28 17h.01M31 26h.01M22 28h.01M17 26h.01M26 33h.01"/>',
    me='<circle cx="24" cy="14" r="7"/><path d="M10 41c0-8 6-14 14-14s14 6 14 14"/>',
    want='<path d="M24 40S8 30 8 19a8 8 0 0 1 16-3 8 8 0 0 1 16 3c0 11-16 21-16 21z"/>',
    talk='<path d="M8 12a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H22l-9 8v-8h-1a4 4 0 0 1-4-4z"/><path d="M17 20h.01M24 20h.01M31 20h.01"/>',
    book='<path d="M24 12c-4-3-9-4-16-4v28c7 0 12 1 16 4 4-3 9-4 16-4V8c-7 0-12 1-16 4zM24 12v28"/>',
    note='<path d="M19 34V11l18-4v23"/><ellipse cx="14" cy="34" rx="5" ry="4"/><ellipse cx="32" cy="30" rx="5" ry="4"/>',
    brush='<path d="M40 7L22 26M18 25c4 0 6 2 6 6 0 6-6 9-16 9 4-3 3-6 4-9 1-4 3-6 6-6z"/>',
    friends='<circle cx="16" cy="16" r="6"/><circle cx="33" cy="18" r="5"/><path d="M5 40c0-7 5-12 11-12s11 5 11 12M29 28c7-2 14 3 14 12"/>',
    seed='<path d="M24 41V22M24 26c-9 0-13-5-13-13 9 0 13 5 13 13zM24 22c0-7 4-11 12-11 0 7-4 11-12 11z"/>',
)
def icon(k): return f'<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{S[k]}</svg>'
def card(k, label, cls=""):
    return f'<span class="sym{" " + cls if cls else ""}">{icon(k)}<b>{label}</b></span>'
