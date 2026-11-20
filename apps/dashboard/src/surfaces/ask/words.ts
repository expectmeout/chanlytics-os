/**
 * Ask's words, in the person's language. One table, read by every part of Ask through askText(lang). Nothing else in them
 * carries a user-facing string, but the answers' own sentences, which are contracts' (ask/answer/normalize.ts). No key symbol is drawn
 * (the Line, D17).
 */
import { POLICY_CLASS_WORDS, type AskPressWord } from "@chanlytics/contracts";

/** What each press says (contracts ASK_PRESS_WORDS), in English. `n` is how many it sends to, where the card knows. */
const PRESS_EN: Record<AskPressWord, (n: number | null) => string> = {
  send: () => "Send",
  send_to: (n) => (n ? `Send to ${n}` : "Send it"),
  post: () => "Post the reply",
  post_it: () => "Post it",
  stop: () => "Stop it",
  whisper: () => "Whisper it",
  ring_me: () => "Ring me",
  test: () => "Send me a test",
  start: () => "Start it",
  run_now: () => "Send it now",
  make: () => "Make it",
  keep: () => "Keep it",
  save: () => "Save it",
  add: () => "Add them",
  change: () => "Change it",
  pause: () => "Pause it",
  resume: () => "Resume it",
  rewrite: () => "Rewrite it",
  forget: () => "Forget it",
  list: () => "Make the list",
  take_over: () => "Take over",
  hand_back: () => "Hand it back",
  snooze: () => "Snooze",
  wake: () => "Wake it",
  archive: () => "Archive",
  resolve: () => "Resolve",
  later: () => "Put under Later",
  take_out: () => "Take them out",
  move: () => "Move them",
  find: () => "Find them",
  find_more: () => "Find more",
  check: () => "Check them",
  booked: () => "Booked it",
  cant: () => "Can't",
  let_go: () => "Let it go",
  skip: () => "Skip it",
  let_through: () => "Let it through",
  invite: () => "Invite them",
  remove: () => "Remove it",
  end: () => "End it",
  throw_away: () => "Throw it away",
  delete: () => "Delete it",
  merge: () => "Merge them",
  open: () => "Open it",
};

/** The same, in Spanish. */
const PRESS_ES: Record<AskPressWord, (n: number | null) => string> = {
  send: () => "Enviar",
  send_to: (n) => (n ? `Enviar a ${n}` : "Enviarlo"),
  post: () => "Publicar la respuesta",
  post_it: () => "Publicarlo",
  stop: () => "Detenerlo",
  whisper: () => "Susurrarlo",
  ring_me: () => "Llámame",
  test: () => "Enviarme una prueba",
  start: () => "Empezar",
  run_now: () => "Enviarlo ahora",
  make: () => "Hacerlo",
  keep: () => "Guardarlo",
  save: () => "Guardarlo",
  add: () => "Añadirlos",
  change: () => "Cambiarlo",
  pause: () => "Pausarlo",
  resume: () => "Reanudarlo",
  rewrite: () => "Reescribirlo",
  forget: () => "Olvidarlo",
  list: () => "Hacer la lista",
  take_over: () => "Tomar el control",
  hand_back: () => "Devolverlo",
  snooze: () => "Posponer",
  wake: () => "Despertarlo",
  archive: () => "Archivar",
  resolve: () => "Resolver",
  later: () => "Dejar para luego",
  take_out: () => "Sacarlos",
  move: () => "Moverlos",
  find: () => "Encontrarlos",
  find_more: () => "Encontrar más",
  check: () => "Comprobarlos",
  booked: () => "Reservado",
  cant: () => "No puedo",
  let_go: () => "Dejarlo salir",
  skip: () => "Saltarlo",
  let_through: () => "Dejarlo pasar",
  invite: () => "Invitarlos",
  remove: () => "Quitarlo",
  end: () => "Terminarlo",
  throw_away: () => "Tirarlo",
  delete: () => "Borrarlo",
  merge: () => "Unirlos",
  open: () => "Abrirlo",
};

/**
 * What a press says while it works, where one word says it (docs/words.md: "…" only for something under way). A press
 * with no word here says the house's wait: a plan's press does several things, and says that too.
 */
const WORKING_EN = "Working…";
const WORKING_ES = "Un momento…";
const PRESSING_EN: Partial<Record<AskPressWord, string>> = {
  send: "Sending…",
  send_to: "Sending…",
  run_now: "Sending…",
  test: "Sending…",
  post: "Posting…",
  post_it: "Posting…",
  save: "Saving…",
  keep: "Saving…",
  make: "Making it…",
  add: "Adding…",
  start: "Starting…",
  change: "Changing…",
  pause: "Pausing…",
  resume: "Resuming…",
  delete: "Deleting…",
};
const PRESSING_ES: Partial<Record<AskPressWord, string>> = {
  send: "Enviando…",
  send_to: "Enviando…",
  run_now: "Enviando…",
  test: "Enviando…",
  post: "Publicando…",
  post_it: "Publicando…",
  save: "Guardando…",
  keep: "Guardando…",
  make: "Haciéndolo…",
  add: "Añadiendo…",
  start: "Empezando…",
  change: "Cambiando…",
  pause: "Pausando…",
  resume: "Reanudando…",
  delete: "Borrando…",
};

/** An Autonomy row's short name. */
const rowName = (row: string): string =>
  (POLICY_CLASS_WORDS as Record<string, { short: string } | undefined>)[row]?.short ?? row;

const ASK_TEXT = {
  en: {
    placeholder: "Ask anything",
    follow: "Follow up…",
    jump: "Jump to",
    nothing: "Nothing matches. Ask it as a question.",
    thinking: "Thinking…",
    unverified: "Not from your data · check before you rely on it",
    read: "Read aloud",
    stop: "Stop reading",
    copy: "Copy the answer",
    copyWord: "Copy",
    copied: "Copied",
    open: "Open",
    from: "From",
    // The first column of a chart's table: a point in time, or a thing compared.
    chartWhen: "When",
    chartName: "Name",
    needsQ: "Who needs me right now?",
    // On Leads (spec F3): the field's placeholder, the section's label and the consent rule under its chips. A placeholder
    // is one line at a 360px phone's width (Ruben, 17 Nov 2026: a two-line field "i do not like"; docs/words.md, 4 words).
    describeLeads: "Which businesses to find?",
    // On Campaigns (the moment spec, A3): the field's placeholder.
    describeCampaigns: "What should go out?",
    /** On Campaigns › Content, where Ask makes posts and videos rather than sends. */
    describeContent: "Say what to make",
    findBusinesses: "Find businesses",
    leadsConsent: "You can email and call leads. Texts and offers wait for their yes.",
    // The Leads section is the finder's, not "Ask about Leads": its label is findBusinesses, said once above.
    askAbout: (surface: string): string =>
      surface === "leads"
        ? ASK_TEXT.en.findBusinesses
        : `Ask about ${
            {
              today: "Today",
              inbox: "the Inbox",
              people: "People",
              conversations: "Conversations",
              live: "Live",
              reports: "Reports",
              settings: "Settings",
              start: "setting up",
              // Every page AI is opened on says its name, never "this page" (Ruben, 17 Nov 2026, on Campaigns).
              campaigns: "Campaigns",
              calendar: "the Calendar",
              pipeline: "the Pipeline",
            }[surface] || "this page"
          }`,
    // AI's home on a phone opened from Today (Today, calm, D10): its title, and the name over the page's own questions.
    homeTitle: "What do you need?",
    aboutToday: "About today",
    earlier: "Earlier",
    // Ask's home: the follow-ups it kept that came due (a search finished, replies came in, the day came).
    followUpsDue: "Ready now",
    noEarlier: "No earlier conversations yet.",
    kind: { person: "Person", thread: "Conversation", call: "Call", page: "Page" },
    rowsLabel: "Ask Chanlytics",
    dialogName: "Ask Chanlytics",
    stopAnswer: "Stop",
    close: "Close",
    clearScope: "Ask without it",
    /** Over the field, before what the question is about (draw.tsx). */
    about: "About",
    attach: "Add a photo",
    attachAway: (name: string) => `Take ${name} away`,
    attachAgain: "Try again",
    attachFailed: "It couldn't be sent. Check your connection and try again.",
    attachGone: "Photo removed",
    attachSending: "Sending the photo",
    attachSendingVideo: "Sending the video",
    attachPreparing: "Preparing the video",
    attachTook: (n: number) => `A question goes with ${n} photos at most. The first ${n} are here.`,
    attachWait: "Your photo is still on its way. Ask once it has arrived.",
    deleted: "Conversation deleted",
    deleteThread: "Delete this conversation",
    deleteAsk: "Delete this conversation?",
    deleteYes: "Yes, delete",
    deleteKeep: "Keep it",
    // What Delete does on a row of the list, said to a reader and drawn nowhere (home.tsx AskRows; D17, no key is drawn).
    deleteByKey: "Press Delete to delete this conversation.",
    notNowByKey: "Press Delete for Not now: it rests a week.",
    threadUnreadable: "That conversation couldn't be opened right now · it is still here · try again.",
    deleteFailed: "Couldn't delete that conversation · try again.",
    copyFailed: "Couldn't copy · select the text instead.",
    talk: "Hold to talk",
    listening: "Listening…",
    micDenied: "The browser needs microphone permission to talk to AI.",
    micFailed: "Couldn't hear you · try again or type it.",
    micBlocked:
      "The microphone is blocked for this site. Allow it in the browser’s site settings · the lock beside the address, or on iPhone the aA menu, Website Settings · then press again.",
    noVoice: "Voice needs Chrome, Edge or Safari · this browser can't listen. Type instead.",
    voice: "Talk with Chanlytics",
    readFailed: "AI's voice couldn't be reached just now.",
    reading: "Getting AI's voice…",
    askSend: "Ask",
    briefMe: "Brief me",
    letGo: "Let go to ask",
    typeInstead: "Type instead",
    needYou: (n: number) => (n === 1 ? "1 needs you" : `${n} need you`),
    runsWaiting: (n: number) => (n === 1 ? "1 send waiting" : `${n} sends waiting`),
    searchWaiting: (n: number) => (n === 1 ? "1 search waiting" : `${n} searches waiting`),
    // A phone's head in a conversation, and the pill back to its newest question (the spec 2026-09-27-ask-chat-on-a-phone, D9, D7).
    newChat: "New",
    latest: "Latest",
    cutOff: "The answer was cut off. Try again.",
    tagCard: "Card",
    notNow: "Not now",
    // What a card keeps behind a press, and whose warning a group's line is (card.tsx AskHoldsAlike).
    details: "Details",
    holdsAll: (n: number) => (n === 2 ? "Both." : `All ${n}.`),
    whereFrom: "Where these come from",
    // A search card a newer one replaced (contracts SEARCH_CARD_REPLACED): the change said to Ask made it again below.
    changedBelow: "Changed below",
    undo: "Undo",
    // Undoing a new one deletes it: the question before it (AskCardReceipt).
    undoCampaignDetail: "It stops for good. Anything already sent keeps its numbers.",
    undoCampaignYes: "Yes, delete it",
    working: WORKING_EN,
    editComposer: "Edit in the composer",
    openIt: "Open it",
    openNew: "Open in New campaign",
    tryAgain: "Try again",
    priceNote: "This looks like a price. AI says only the prices your settings allow · you may say any.",
    windowNote:
      "Over a day since they wrote, so only an approved message can reach them. Open the conversation to pick one.",
    // The press says what it does (D14 of the answers canvas; contracts askPressOf names which).
    press: (word: AskPressWord, n: number | null): string => PRESS_EN[word](n),
    // While its own press runs (card-parts.tsx): what it is doing, at full strength, never a dimmed button.
    pressing: (word: AskPressWord): string => PRESSING_EN[word] ?? WORKING_EN,
    posting: "Posting on Google",
    // A post put up from Ask's card (card-publish.tsx), on the same clock: now, or set for its time.
    postingPost: (when: string | null) => (when ? `Setting it for ${when}` : "Posting it"),
    // Why it ran with no press (contracts freedomOf): the line under what it did.
    whyAlone: (reason: string, row: string | null): string => {
      const name = row ? rowName(row) : "that row";
      if (reason === "row_auto") return `Because ${name} is set to Sends it.`;
      if (reason === "row_veto") return `Because ${name} is set to Holds it.`;
      if (reason === "at_once") return "This one always goes at once.";
      return "It only keeps a record, and your rows allow that.";
    },
    whyChange: "Change it",
    pressOffer: "Start the offer",
    pressPlan: "Do it",
    // A plan whose one press starts several campaigns names them by their count.
    pressAll: (n: number) => `Start all ${n}`,
    // A plan's one card (card.tsx AskPlan): its fold and what a press left.
    howItRuns: "How it runs",
    planDone: "Done.",
    planAllOn: (n: number) => `All ${n} are on. Each says below when it starts.`,
    // What a press left for the next one: a send that waits for what another comes back with.
    planLeft: (n: number) => (n === 1 ? "1 more starts with the next press." : `${n} more start with the next press.`),
    fixIt: "Fix it",
    planUndone: "Undone. Nothing goes out.",
    planPaused: "Paused. Nothing goes out.",
    pause: "Pause",
    resume: "Resume",
    planKept: (n: number) => (n === 1 ? "1 part stays:" : `${n} parts stay:`),
    // A card with words is changed by saying it on Ask's line (Ruben, 12 Nov 2026: no preset changes; the quick changes of
    // D25 -- Shorter, Warmer, Spanish too -- are gone): what the line says while one is open.
    changeAnything: "Change anything…",
    postDrawing: "Drawing the picture",
  },
  es: {
    placeholder: "Pregunta lo que quieras",
    follow: "Sigue preguntando…",
    jump: "Ir a",
    nothing: "Nada coincide. Pregúntalo.",
    thinking: "Pensando…",
    unverified: "No viene de tus datos · compruébalo antes de fiarte",
    read: "Leer en voz alta",
    stop: "Dejar de leer",
    copy: "Copiar la respuesta",
    copyWord: "Copiar",
    copied: "Copiado",
    open: "Abrir",
    from: "De",
    chartWhen: "Cuándo",
    chartName: "Nombre",
    needsQ: "¿Quién me necesita ahora?",
    describeLeads: "¿Qué negocios buscar?",
    describeCampaigns: "¿Qué debe salir?",
    describeContent: "Di qué hacer",
    findBusinesses: "Encontrar negocios",
    leadsConsent: "Puedes escribir y llamar a los leads. Los SMS y las ofertas esperan su sí.",
    askAbout: (surface: string): string =>
      surface === "leads"
        ? ASK_TEXT.es.findBusinesses
        : `Pregunta sobre ${
            {
              today: "Hoy",
              inbox: "el Inbox",
              people: "Personas",
              conversations: "Conversaciones",
              live: "En vivo",
              reports: "Informes",
              settings: "Ajustes",
              start: "la configuración",
              campaigns: "Campañas",
              calendar: "el Calendario",
              pipeline: "el Pipeline",
            }[surface] || "esta página"
          }`,
    homeTitle: "¿Qué necesitas?",
    aboutToday: "Sobre hoy",
    earlier: "Anteriores",
    followUpsDue: "Listo ahora",
    noEarlier: "Aún no hay conversaciones anteriores.",
    kind: { person: "Persona", thread: "Hilo", call: "Llamada", page: "Página" },
    rowsLabel: "Pregunta a Chanlytics",
    dialogName: "Pregunta a Chanlytics",
    stopAnswer: "Detener",
    close: "Cerrar",
    clearScope: "Preguntar sin esto",
    about: "Sobre",
    attach: "Añadir una foto",
    attachAway: (name: string) => `Quitar ${name}`,
    attachAgain: "Reintentar",
    attachFailed: "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.",
    attachGone: "Foto eliminada",
    attachSending: "Enviando la foto",
    attachSendingVideo: "Enviando el video",
    attachPreparing: "Preparando el video",
    attachTook: (n: number) => `Una pregunta lleva ${n} fotos como máximo. Aquí están las primeras ${n}.`,
    attachWait: "Tu foto aún se está enviando. Pregunta cuando haya llegado.",
    deleted: "Conversación borrada",
    deleteThread: "Borrar esta conversación",
    deleteAsk: "¿Borrar esta conversación?",
    deleteYes: "Sí, borrar",
    deleteKeep: "Mantenerla",
    deleteByKey: "Pulsa Supr para borrar esta conversación.",
    notNowByKey: "Pulsa Supr para decir Ahora no: descansa una semana.",
    threadUnreadable: "No se pudo abrir esa conversación ahora · sigue aquí; inténtalo de nuevo.",
    deleteFailed: "No se pudo borrar esa conversación · inténtalo de nuevo.",
    copyFailed: "No se pudo copiar · selecciona el texto.",
    talk: "Mantén para hablar",
    listening: "Escuchando…",
    micDenied: "El navegador necesita permiso del micrófono para hablar con AI.",
    micFailed: "No te oí · inténtalo de nuevo o escríbelo.",
    micBlocked:
      "El micrófono está bloqueado para este sitio. Permítelo en los ajustes del sitio del navegador · el candado junto a la dirección, o en iPhone el menú aA, Ajustes del sitio web · y vuelve a pulsar.",
    noVoice: "La voz necesita Chrome, Edge o Safari · este navegador no puede escuchar. Escríbelo.",
    voice: "Habla con Chanlytics",
    readFailed: "No se pudo llegar a la voz de AI ahora mismo.",
    reading: "Buscando la voz de AI…",
    askSend: "Preguntar",
    briefMe: "Resúmeme",
    letGo: "Suelta para preguntar",
    typeInstead: "Escribir",
    needYou: (n: number) => (n === 1 ? "1 te necesita" : `${n} te necesitan`),
    runsWaiting: (n: number) => (n === 1 ? "1 envío en espera" : `${n} envíos en espera`),
    searchWaiting: (n: number) => (n === 1 ? "1 búsqueda en espera" : `${n} búsquedas en espera`),
    newChat: "Nueva",
    latest: "Lo último",
    cutOff: "Se cortó la respuesta. Inténtalo de nuevo.",
    tagCard: "Tarjeta",
    notNow: "Ahora no",
    details: "Detalles",
    holdsAll: (n: number) => (n === 2 ? "Las dos." : `Las ${n}.`),
    whereFrom: "De dónde salen",
    changedBelow: "Cambiada abajo",
    undo: "Deshacer",
    undoCampaignDetail: "Se detiene para siempre. Lo ya enviado conserva sus números.",
    undoCampaignYes: "Sí, borrarla",
    working: WORKING_ES,
    editComposer: "Editar en el redactor",
    openIt: "Abrirlo",
    openNew: "Abrir en Nueva secuencia",
    tryAgain: "Reintentar",
    priceNote:
      "Parece un precio. La recepcionista solo da los precios que permite tu configuración · tú puedes dar cualquiera.",
    windowNote:
      "Su ventana de 24 horas está cerrada: solo se puede enviar una plantilla aprobada. Abre el hilo para elegir una.",
    press: (word: AskPressWord, n: number | null): string => PRESS_ES[word](n),
    pressing: (word: AskPressWord): string => PRESSING_ES[word] ?? WORKING_ES,
    posting: "Publicando en Google",
    postingPost: (when: string | null) => (when ? `Programándolo para ${when}` : "Publicándolo"),
    whyAlone: (reason: string, row: string | null): string => {
      const name = row ? rowName(row) : "esa fila";
      if (reason === "row_auto") return `Porque ${name} está en Lo envía.`;
      if (reason === "row_veto") return `Porque ${name} está en Lo retiene.`;
      if (reason === "at_once") return "Esto siempre va al momento.";
      return "Solo guarda un registro, y tus filas lo permiten.";
    },
    whyChange: "Cambiarlo",
    pressOffer: "Empezar la oferta",
    pressPlan: "Hazlo",
    pressAll: (n: number) => `Empezar las ${n}`,
    howItRuns: "Cómo funciona",
    planDone: "Hecho.",
    planAllOn: (n: number) => `Las ${n} están en marcha. Cada una dice abajo cuándo empieza.`,
    planLeft: (n: number) =>
      n === 1 ? "1 más empieza con el siguiente toque." : `${n} más empiezan con el siguiente toque.`,
    fixIt: "Arreglarlo",
    planUndone: "Deshecho. No sale nada.",
    planPaused: "En pausa. No sale nada.",
    pause: "Pausar",
    resume: "Reanudar",
    planKept: (n: number) => (n === 1 ? "Queda 1 parte:" : `Quedan ${n} partes:`),
    changeAnything: "Cambia lo que quieras…",
    postDrawing: "Dibujando la imagen",
  },
};

/** The words the Line reads, each language the same keys. */
export type LineWords = (typeof ASK_TEXT)["en"];

/** The table for a language: Spanish where the Line speaks it, English otherwise. */
export const askText = (lang?: string | null): LineWords => ASK_TEXT[lang === "es" ? "es" : "en"];
