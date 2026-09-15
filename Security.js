// The sole external-navigation policy. QML JS has no WHATWG URL constructor;
// accept a deliberately narrow ASCII grammar, not every browser URL spelling.
.pragma library
var MAX_APP_NAME=256, MAX_SUMMARY=2048, MAX_BODY=32768, MAX_RAW_BODY=32768
var MAX_ACTIONS=16, MAX_ACTION_LABEL=256, MAX_ACTION_ID=256, MAX_SOURCE=253
var MAX_URL=4096, MAX_CODES=8, MAX_PHONE=64, MAX_HISTORY_ENTRY_BYTES=65536
function bounded(value, max) { return typeof value === 'string' ? value.slice(0,max) : '' }
function containsControlChars(s) { return /[\x00-\x20\x7f-\x9f\\]/.test(s) }
function canonicalHostname(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_SOURCE) return ''
  var h=raw.toLowerCase().replace(/\.$/,'')
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(h)) return ''
  // WHATWG host parsing treats a URL as a numeric (IPv4) address whenever its
  // last label "looks like a number" - not only plain decimal ("127.0.0.1"),
  // but also 0x-prefixed hex ("0x7f.0x0.0x0.0x1" -> 127.0.0.1) and
  // leading-zero octal ("0177.0.0.1"), which a browser's URL parser (and any
  // library replicating it) will canonicalise to a numeric/private address
  // even though this label-shape check alone would pass it through as an
  // ordinary hostname. Octal is already all-decimal-digit and so already
  // matched by the plain digit alternative; hex needs its own alternative.
  if (/^(?:0x[0-9a-f]*|[0-9]+)$/i.test(h.split('.').pop())) return ''
  return h
}
function urlHasUserInfo(s) { return /^[a-z]+:\/\/[^/?#]*@/i.test(s) }
function safeHttpUrl(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_URL || containsControlChars(raw)) return ''
  // Reject nested escapes and encoded controls; never decode and re-authorize.
  if (/%(?:0[0-9a-f]|1[0-9a-f]|7f|25|5c)/i.test(raw) || /[<>"']/.test(raw)) return ''
  var m=raw.match(/^(https?):\/\/([^/?#]+)([^]*)$/i)
  if (!m || urlHasUserInfo(raw)) return ''
  var a=m[2].match(/^([^:%@]+)(?::([0-9]{1,5}))?$/)
  if (!a) return ''
  var h=canonicalHostname(a[1])
  if (!h || (a[2] && (+a[2]<1 || +a[2]>65535))) return ''
  // Invalid escapes can acquire different meaning in different URL handlers.
  if (/%(?![0-9a-f]{2})/i.test(m[3])) return ''
  return m[1].toLowerCase()+'://'+h+(a[2]?':'+String(+a[2]):'')+(m[3]||'/')
}
function safeMailtoUrl(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_URL || containsControlChars(raw)) return ''
  // One address only: no headers, attachments, percent encoding or URI queries.
  var m=raw.match(/^mailto:([a-z0-9.!#$&'*+\/=?^_`{|}~-]{1,64})@([^?\/#]+)$/i)
  if (!m || /[?#]/.test(m[1])) return ''
  var h=canonicalHostname(m[2]); return h ? 'mailto:'+m[1]+'@'+h : ''
}
function safeExternalUrl(raw) { return /^mailto:/i.test(raw) ? safeMailtoUrl(raw) : safeHttpUrl(raw) }
function isAllowedScheme(raw) { return !!safeExternalUrl(raw) }
function hostOf(raw) {
  var u=safeHttpUrl(raw), m=u.match(/^https?:\/\/([^/:?#]+)/)
  return m ? m[1] : ''
}
function openExternalUrl(raw) {
  var safe=safeExternalUrl(raw)
  return safe ? Qt.openUrlExternally(safe) : false
}

// Omarchy screenshot toasts (and other omarchy-action notifications) carry the
// click command as hint omarchy-exec-argv, a JSON argv string. Stock
// omarchy.notifications runs it on Super+Alt+, / card click. Structural
// checks only: a well-formed argv from omarchy-action is accepted; shells,
// relative paths, and leading-dash programs are not.
function parseOmarchyExecArgv(value) {
  if (Array.isArray(value)) {
    try { value = JSON.stringify(value) } catch (e) { return null }
  }
  var text = String(value || "")
  if (!text || text.length > MAX_BODY) return null

  var parsed
  try { parsed = JSON.parse(text) } catch (e) { return null }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 32) return null
  for (var i = 0; i < parsed.length; i++) {
    if (typeof parsed[i] !== "string" || parsed[i].length > MAX_URL) return null
  }

  var prog = parsed[0]
  if (!prog || prog.charAt(0) === "-") return null
  var base = prog.substring(prog.lastIndexOf("/") + 1)
  if (/^(?:ba)?sh$|^dash$|^zsh$|^fish$|^env$|^python[0-9.]*$|^perl$|^ruby$/.test(base)) return null
  if (prog.charAt(0) === "/") {
    if (prog.indexOf("\0") >= 0 || /\/\.\.(?:\/|$)/.test(prog)) return null
  } else if (!/^[A-Za-z0-9._+-]+$/.test(prog)) {
    return null
  }
  return parsed
}
