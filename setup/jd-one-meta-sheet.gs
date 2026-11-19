/**
 * JD One ↔ Meta leads sheet  (version 2 · 19 Nov 2026)
 *
 * Paste this whole file in the Google Sheet: Extensions → Apps Script → replace everything → Save.
 * Then reload the sheet and use the new "JD One" menu → "Connect to JD One" and paste the key
 * shown in JD One (Sales → Meta sheet link). That is all.
 *
 * What it does
 *  - Every minute: every tab whose name starts with "Campaign" is read. Rows not yet sent go to
 *    JD One as leads (the first run sends all old rows too). A new tab "Campaign 3" is picked up
 *    on its own – nothing to change. Tabs switched off in JD One (Sales → Meta sheet link) are
 *    left alone completely: nothing is sent from them and nothing is written into them.
 *  - Every 10 minutes: the progress made in JD One (stage, who has it, calls, last call,
 *    next follow-up, remark) is written back into the sheet, and the "JD One summary" tab is rebuilt.
 *      · Tabs in the agency's own layout (with a "Lead Stage" column) get their own columns filled.
 *      · Tabs straight from Meta get extra "JD One …" columns at the end, so the agency's own
 *        columns (Stage / WhatsApp etc.) are never touched.
 *
 * The key is kept in this script's private settings, not in the sheet. Nothing here is secret.
 */

var JDONE_RPC = 'https://cyimbgjzxxxszjadxpgv.supabase.co/rest/v1/rpc/';
var JDONE_PUBLIC_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5aW1iZ2p6eHh4c3pqYWR4cGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMTg2MDgsImV4cCI6MjA5OTc5NDYwOH0.R-8de9Ccqui113tBsAvdhHE04LZ6Hlz09bY1vymAcv4';
var TAB_PREFIX = 'campaign';
var SENT_TAB = '_jdone_sent';
var SUMMARY_TAB = 'JD One summary';
var BATCH = 200;
var TZ = 'Asia/Kolkata';

/* ---------------- menu ---------------- */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('JD One')
    .addItem('Connect to JD One', 'connect')
    .addSeparator()
    .addItem('Send new leads now', 'sendNewLeads')
    .addItem('Update status from JD One now', 'pullStatus')
    .addItem('Show link status', 'showStatus')
    .addToUi();
}

function connect() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Connect to JD One', 'Paste the key from JD One → Sales → Meta sheet link', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var key = String(res.getResponseText() || '').trim();
  if (key.length < 20) return ui.alert('That does not look like the key. Copy it again from JD One.');
  PropertiesService.getScriptProperties().setProperty('JDONE_KEY', key);
  try {
    call_('sheet_lead_status', { p_key: key });
  } catch (e) {
    PropertiesService.getScriptProperties().deleteProperty('JDONE_KEY');
    return ui.alert('JD One did not accept this key.\n\n' + e.message);
  }
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'sendNewLeads' || f === 'pullStatus') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendNewLeads').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('pullStatus').timeBased().everyMinutes(10).create();
  var sent = sendNewLeads();
  pullStatus();
  ui.alert('Connected.\n\n' + sent + ' leads sent to JD One now. New leads will go every minute, and JD One progress will come back every 10 minutes.');
}

function showStatus() {
  var p = PropertiesService.getScriptProperties();
  SpreadsheetApp.getUi().alert(
    'JD One link\n\n' +
      'Connected: ' + (p.getProperty('JDONE_KEY') ? 'yes' : 'NO – use Connect to JD One') + '\n' +
      'Last leads sent: ' + (p.getProperty('LAST_SEND') || '–') + '\n' +
      'Last status update: ' + (p.getProperty('LAST_PULL') || '–') + '\n' +
      'Last problem: ' + (p.getProperty('LAST_ERROR') || 'none')
  );
}

/* ---------------- sheet → JD One ---------------- */

function sendNewLeads() {
  var key = PropertiesService.getScriptProperties().getProperty('JDONE_KEY');
  if (!key) return 0;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return 0;
  var started = Date.now();
  var total = 0;
  try {
    var ss = SpreadsheetApp.getActive();
    var sentSheet = sentSheet_(ss);
    var sent = {};
    var last = sentSheet.getLastRow();
    if (last > 0) sentSheet.getRange(1, 1, last, 1).getValues().forEach(function (r) { sent[r[0]] = true; });

    var pending = [];
    activeTabs_(ss, key).forEach(function (sh) {
      readTab_(sh).rows.forEach(function (row) {
        if (!sent[row.key]) pending.push(row);
      });
    });

    while (pending.length && Date.now() - started < 240000) {
      var part = pending.splice(0, BATCH);
      call_('sheet_ingest_leads', { p_key: key, p_rows: part.map(function (r) { return r.data; }) });
      sentSheet.getRange(sentSheet.getLastRow() + 1, 1, part.length, 1).setValues(part.map(function (r) { sent[r.key] = true; return [r.key]; }));
      total += part.length;
    }
    if (total) PropertiesService.getScriptProperties().setProperty('LAST_SEND', stamp_() + ' · ' + total + ' rows');
    PropertiesService.getScriptProperties().deleteProperty('LAST_ERROR');
  } catch (e) {
    PropertiesService.getScriptProperties().setProperty('LAST_ERROR', stamp_() + ' · ' + e.message);
  } finally {
    lock.releaseLock();
  }
  return total;
}

/* ---------------- JD One → sheet ---------------- */

var AGENCY_COLS = {
  stage: ['leadstage'],
  incharge: ['assignedto'],
  calls: ['callattempts'],
  last: ['lastcontacted'],
  next: ['nextfollowup'],
  remark: ['staffremarks'],
};
var JD_COLS = [
  ['stage', 'JD One Stage'],
  ['incharge', 'JD One Incharge'],
  ['calls', 'JD One Calls'],
  ['last', 'JD One Last call'],
  ['next', 'JD One Next follow-up'],
  ['remark', 'JD One Remark'],
];

function pullStatus() {
  var key = PropertiesService.getScriptProperties().getProperty('JDONE_KEY');
  if (!key) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    var list = call_('sheet_lead_status', { p_key: key }) || [];
    var byId = {}, byPhone = {};
    list.forEach(function (s) {
      if (s.id) byId[s.id] = s;
      if (s.phone) byPhone[s.phone] = s;
    });
    var ss = SpreadsheetApp.getActive();
    var summary = {};
    activeTabs_(ss, key).forEach(function (sh) {
      var t = readTab_(sh);
      if (!t.rows.length) return;
      var agency = findCol_(t.heads, AGENCY_COLS.stage) >= 0;
      var cols = {};
      if (agency) {
        Object.keys(AGENCY_COLS).forEach(function (f) { cols[f] = findCol_(t.heads, AGENCY_COLS[f]); });
      } else {
        JD_COLS.forEach(function (c) {
          var i = t.rawHeads.indexOf(c[1]);
          if (i < 0) {
            i = sh.getLastColumn();
            sh.getRange(1, i + 1).setValue(c[1]).setFontWeight('bold').setBackground('#fdf6e3');
            t.rawHeads[i] = c[1];
          }
          cols[c[0]] = i;
        });
      }
      var counts = (summary[sh.getName()] = summary[sh.getName()] || {});
      Object.keys(cols).forEach(function (f) {
        var ci = cols[f];
        if (ci < 0) return;
        var rng = sh.getRange(2, ci + 1, t.lastRow - 1, 1);
        var vals = rng.getValues();
        var changed = false;
        t.rows.forEach(function (row) {
          var s = (row.data.meta_id && byId[row.data.meta_id]) || byPhone[row.phone10];
          if (!s) return;
          if (f === 'stage') counts[s.stage] = (counts[s.stage] || 0) + 1;
          var v = value_(f, s);
          if (v === null || v === '') return;
          var cur = vals[row.index][0];
          if (String(cur) !== String(v) && !(cur instanceof Date && v instanceof Date && cur.getTime() === v.getTime())) {
            vals[row.index][0] = v;
            changed = true;
          }
        });
        if (changed) rng.setValues(vals);
      });
    });
    writeSummary_(ss, summary, list);
    PropertiesService.getScriptProperties().setProperty('LAST_PULL', stamp_() + ' · ' + list.length + ' leads');
    PropertiesService.getScriptProperties().deleteProperty('LAST_ERROR');
  } catch (e) {
    PropertiesService.getScriptProperties().setProperty('LAST_ERROR', stamp_() + ' · ' + e.message);
  } finally {
    lock.releaseLock();
  }
}

function value_(f, s) {
  if (f === 'stage') return s.stage;
  if (f === 'incharge') return s.incharge ? String(s.incharge).split(' ')[0] : null;
  if (f === 'calls') return s.calls ? Number(s.calls) : null;
  if (f === 'last' || f === 'next') return s[f] ? toDate_(s[f]) : null;
  if (f === 'remark') return s.remark || null;
  return null;
}

var STAGE_ORDER = ['New', 'Not Answered', 'Callback Scheduled', 'Discussed', 'Hot – Interested', 'Quotation sent', 'Booked', 'Lost'];

function writeSummary_(ss, summary, list) {
  var sh = ss.getSheetByName(SUMMARY_TAB) || ss.insertSheet(SUMMARY_TAB);
  var tabs = Object.keys(summary);
  var out = [['JD One summary – all campaigns (updates every 10 minutes, do not type here)'].concat(blank_(tabs.length + 1))];
  out.push(['Updated ' + stamp_()].concat(blank_(tabs.length + 1)));
  out.push(blank_(tabs.length + 2));
  out.push(['Stage'].concat(tabs).concat(['All campaigns']));
  STAGE_ORDER.forEach(function (st) {
    var all = 0;
    var line = [st];
    tabs.forEach(function (t) { var n = summary[t][st] || 0; all += n; line.push(n); });
    out.push(line.concat([all]));
  });
  var totals = ['Total'];
  var grand = 0;
  tabs.forEach(function (t) {
    var n = 0;
    Object.keys(summary[t]).forEach(function (k) { n += summary[t][k]; });
    grand += n;
    totals.push(n);
  });
  out.push(totals.concat([grand]));
  out.push(blank_(tabs.length + 2));
  var people = {};
  list.forEach(function (s) {
    var p = s.incharge ? String(s.incharge).split(' ')[0] : 'Not given yet';
    people[p] = people[p] || { leads: 0, hot: 0, booked: 0, overdue: 0 };
    people[p].leads++;
    if (s.stage === 'Hot – Interested' || s.stage === 'Quotation sent') people[p].hot++;
    if (s.stage === 'Booked') people[p].booked++;
    if (s.next && s.stage !== 'Booked' && s.stage !== 'Lost' && String(s.next) < today_()) people[p].overdue++;
  });
  out.push(['Person', 'Leads', 'Hot + quoted', 'Booked', 'Follow-ups overdue'].concat(blank_(tabs.length - 3)));
  Object.keys(people).sort().forEach(function (p) {
    var x = people[p];
    out.push([p, x.leads, x.hot, x.booked, x.overdue].concat(blank_(tabs.length - 3)));
  });
  var width = Math.max(tabs.length + 2, 5);
  out = out.map(function (r) { r = r.slice(0, width); while (r.length < width) r.push(''); return r; });
  sh.clearContents();
  sh.getRange(1, 1, out.length, width).setValues(out);
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(13);
  sh.getRange(4, 1, 1, width).setFontWeight('bold').setBackground('#f3f4f6');
}

/* ---------------- reading a campaign tab ---------------- */

var MAP = {
  meta_id: function (h) { return h === 'id' || h === 'metaleadid' || h === 'leadid'; },
  created: function (h) { return h === 'createdtime' || h.indexOf('leadreceived') === 0; },
  name: function (h) { return h === 'fullname' || h === 'guestname' || h === 'name'; },
  phone: function (h) { return h === 'phonenumber' || h.indexOf('phone') === 0; },
  email: function (h) { return h === 'email'; },
  platform: function (h) { return h === 'platform'; },
  campaign: function (h) { return h === 'campaignname' || h === 'campaign'; },
  ad_name: function (h) { return h === 'adname'; },
  with: function (h) { return h.indexOf('staywith') >= 0 || h === 'travellingwith'; },
  occasion: function (h) { return h.indexOf('whatareyouplanning') === 0 || h === 'occasion'; },
  guests: function (h) { return h.indexOf('howmanyguests') === 0 || h === 'guests'; },
  when: function (h) { return h.indexOf('whenareyou') === 0 || h === 'planningtovisit'; },
  package: function (h) { return h.indexOf('stayoption') >= 0 || h.indexOf('package') >= 0; },
  stage: function (h) { return h === 'leadstage' || h === 'stage'; },
  incharge: function (h) { return h === 'assignedto' || h === 'incharge'; },
  remark: function (h) { return h === 'staffremarks' || h === 'remark' || h === 'remarks'; },
  follow_up: function (h) { return h === 'nextfollowup' || h === 'followupdate'; },
  calls: function (h) { return h === 'callattempts'; },
  last_contacted: function (h) { return h === 'lastcontacted'; },
};

function readTab_(sh) {
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 2) return { rows: [], heads: [], rawHeads: [], lastRow: lastRow };
  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var rawHeads = values[0].map(function (h) { return String(h).trim(); });
  var heads = rawHeads.map(norm_);
  var col = {};
  Object.keys(MAP).forEach(function (f) {
    for (var i = 0; i < heads.length; i++) if (heads[i] && MAP[f](heads[i])) { col[f] = i; break; }
  });
  // Agency layout keeps the package in a column with no heading – find it by the ₹ sign.
  if (col.package === undefined) {
    for (var j = 0; j < heads.length; j++) {
      if (!heads[j] && values.slice(1, 6).some(function (r) { return String(r[j]).indexOf('₹') >= 0; })) { col.package = j; break; }
    }
  }
  var rows = [];
  if (col.phone === undefined) return { rows: rows, heads: heads, rawHeads: rawHeads, lastRow: lastRow };
  for (var r = 1; r < values.length; r++) {
    var v = values[r];
    var phone10 = digits10_(v[col.phone]);
    if (!phone10) continue;
    var data = { tab: sh.getName() };
    Object.keys(col).forEach(function (f) { data[f] = clean_(f, v[col[f]]); });
    data.phone = phone10;
    rows.push({ key: data.meta_id || 'p:' + phone10, phone10: phone10, index: r - 1, data: data });
  }
  return { rows: rows, heads: heads, rawHeads: rawHeads, lastRow: lastRow };
}

function clean_(f, v) {
  if (v instanceof Date) {
    return f === 'created'
      ? Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX")
      : Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  }
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (f === 'with' || f === 'occasion' || f === 'when' || f === 'package' || f === 'guests') {
    s = s.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.charAt(0).toUpperCase() + s.slice(1);
  }
  return s;
}

/* ---------------- helpers ---------------- */

function campaignTabs_(ss) {
  return ss.getSheets().filter(function (sh) { return sh.getName().trim().toLowerCase().indexOf(TAB_PREFIX) === 0; });
}

/** Campaign tabs that are switched on in JD One. Also tells JD One which tabs the sheet has. */
function activeTabs_(ss, key) {
  var tabs = campaignTabs_(ss);
  var seen = {};
  tabs.forEach(function (sh) { seen[sh.getName()] = { rows: Math.max(sh.getLastRow() - 1, 0) }; });
  var cfg = call_('sheet_config', { p_key: key, p_tabs: seen }) || {};
  var skip = (cfg.skip || []).map(function (t) { return String(t).trim().toLowerCase(); });
  return tabs.filter(function (sh) { return skip.indexOf(sh.getName().trim().toLowerCase()) < 0; });
}

function sentSheet_(ss) {
  var sh = ss.getSheetByName(SENT_TAB);
  if (!sh) {
    sh = ss.insertSheet(SENT_TAB);
    sh.hideSheet();
  }
  return sh;
}

function findCol_(heads, names) {
  for (var i = 0; i < heads.length; i++) if (names.indexOf(heads[i]) >= 0) return i;
  return -1;
}

function norm_(h) { return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

function digits10_(p) {
  var d = String(p === null || p === undefined ? '' : p).replace(/\D/g, '');
  if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
  if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
  if (d.length > 12) d = d.slice(-10);
  return d.length >= 10 ? d : '';
}

function toDate_(iso) {
  var p = String(iso).slice(0, 10).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function stamp_() { return Utilities.formatDate(new Date(), TZ, 'd MMM yyyy, HH:mm'); }
function blank_(n) { var a = []; for (var i = 0; i < n; i++) a.push(''); return a; }

function call_(fn, body) {
  var res = UrlFetchApp.fetch(JDONE_RPC + fn, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: JDONE_PUBLIC_KEY, Authorization: 'Bearer ' + JDONE_PUBLIC_KEY, 'Content-Profile': 'jdone', 'Accept-Profile': 'jdone' },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code >= 300) {
    var msg = text;
    try { msg = JSON.parse(text).message || text; } catch (e) {}
    throw new Error('JD One said: ' + msg);
  }
  return text ? JSON.parse(text) : null;
}
