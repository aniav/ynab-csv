// see http://stackoverflow.com/questions/2897619/using-html5-javascript-to-generate-and-save-a-file
// see http://stackoverflow.com/questions/18662404/download-lengthy-data-as-a-csv-file
var encodings = [
  "UTF-8", "IBM866", "ISO-8859-1", "ISO-8859-2", "ISO-8859-3", "ISO-8859-4", "ISO-8859-5",
  "ISO-8859-6", "ISO-8859-7", "ISO-8859-8", "ISO-8859-8-I", "ISO-8859-10",
  "ISO-8859-13", "ISO-8859-14", "ISO-8859-15", "ISO-8859-16", "KOI8-R",
  "KOI8-U", "macintosh", "windows-874", "windows-1250", "windows-1251",
  "windows-1252", "windows-1253", "windows-1254", "windows-1255",
  "windows-1256", "windows-1257", "windows-1258", "x-mac-cyrillic", "GBK",
  "gb18030", "Big5", "EUC-JP", "ISO-2022-JP", "Shift_JIS", "EUC-KR",
  "replacement", "UTF-16BE", "UTF-16LE", "x-user-defined"
]
var delimiters = [
  "auto",
  ",",
  ";",
  "|"
]
var old_ynab_cols = ["Date", "Payee", "Memo", "Outflow", "Inflow"];
var new_ynab_cols = ["Date", "Payee", "Memo", "Amount"];
var defaultProfile = {
  columnFormat: old_ynab_cols,
  chosenColumns: old_ynab_cols.reduce(function (acc, val) {
    acc[val] = val;
    return acc;
  }, {}),
  chosenEncoding: "UTF-8",
  chosenDelimiter: "auto",
  startAtRow: 1,
  normalizeDate: false,
  extraRow: false
};
var defaultProfiles = {
  "default profile": defaultProfile
};

Date.prototype.yyyymmdd = function () {
  var mm = this.getMonth() + 1; // getMonth() is zero-based
  var dd = this.getDate();

  return [this.getFullYear(),
    (mm > 9 ? '' : '0') + mm,
    (dd > 9 ? '' : '0') + dd
  ].join('');
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// Alpine.js component for the whole page (see x-data="ynabApp" in index.html).
// Kept free of Alpine-specific magics so it can be unit tested as a plain object.
function ynabApp() {
  return {
    loaded: false,
    dragging: false,
    profileName: null,
    profiles: {},
    profile: {},
    ynab_cols: [],
    ynab_map: {},
    inverted_outflow: false,
    normalize_date: false,
    file: {},
    data_object: new DataObject(),

    init: function () {
      this.setInitialState();
      this.loaded = true;
    },

    setInitialState: function () {
      var params = new URLSearchParams(window.location.search);
      this.profileName = (params.get('profile') || localStorage.getItem('profileName') || 'default profile').toLowerCase();
      this.profiles = JSON.parse(localStorage.getItem('profiles')) || clone(defaultProfiles);
      if (!this.profiles[this.profileName]) {
        this.profiles[this.profileName] = clone(defaultProfile);
      }
      this.applyProfile();
      this.inverted_outflow = false;
      this.dragging = false;
      this.data_object = new DataObject();
    },

    applyProfile: function () {
      var profile = this.profiles[this.profileName];
      profile.columnFormat = profile.columnFormat || old_ynab_cols.slice();
      profile.chosenColumns = profile.chosenColumns || {};
      this.profile = profile;
      this.ynab_cols = profile.columnFormat;
      this.ynab_map = profile.chosenColumns;
      this.normalize_date = profile.normalizeDate || false;
      this.file = {
        encodings: encodings,
        delimiters: delimiters,
        chosenEncoding: profile.chosenEncoding || "UTF-8",
        chosenDelimiter: profile.chosenDelimiter || "auto",
        startAtRow: profile.startAtRow || 1,
        extraRow: profile.extraRow || false
      };
    },

    saveProfiles: function () {
      localStorage.setItem('profiles', JSON.stringify(this.profiles));
    },

    profileChosen: function (profileName) {
      var url = new URL(window.location.href);
      url.searchParams.set('profile', profileName);
      window.history.replaceState(null, '', url);
      localStorage.setItem('profileName', profileName);
      this.profileName = profileName;
      this.applyProfile();
    },

    // Called when any of the "Input file config" fields change.
    settingsChanged: function () {
      this.profile.chosenEncoding = this.file.chosenEncoding;
      this.profile.chosenDelimiter = this.file.chosenDelimiter;
      this.profile.startAtRow = this.file.startAtRow;
      this.profile.extraRow = this.file.extraRow;
      this.saveProfiles();
    },

    nonDefaultProfilesExist: function () {
      return Object.keys(this.profiles).length > 1;
    },

    toggleColumnFormat: function () {
      this.ynab_cols = this.ynab_cols.includes("Amount") ? old_ynab_cols.slice() : new_ynab_cols.slice();
      this.profile.columnFormat = this.ynab_cols;
      this.saveProfiles();
    },

    toggleNormalizeDate: function () {
      this.normalize_date = !this.normalize_date;
      this.profile.normalizeDate = this.normalize_date;
      this.saveProfiles();
    },

    invertFlows: function () {
      this.inverted_outflow = !this.inverted_outflow;
    },

    get preview() {
      if (!this.data_object.base_json) {
        return [];
      }
      return this.data_object.converted_json(10, this.ynab_cols, this.ynab_map, this.inverted_outflow, this.normalize_date);
    },

    // --- loading data ---------------------------------------------------

    loadCsv: function (text) {
      if (!text) {
        return;
      }
      var delimiter = this.file.chosenDelimiter == "auto" ? null : this.file.chosenDelimiter;
      this.data_object.parseCsv(text, this.file.chosenEncoding, this.file.startAtRow, this.profile.extraRow, delimiter);
    },

    readFile: function (file) {
      var self = this;
      var reader = new FileReader();
      reader.onload = function (loadEvent) {
        self.loadCsv(loadEvent.target.result);
      };
      reader.readAsText(file, this.file.chosenEncoding);
    },

    onFileChange: function (event) {
      var file = event.target.files[0];
      if (file) {
        this.readFile(file);
      }
      // Allow choosing the same file again after "Load a different file".
      event.target.value = "";
    },

    onDragOver: function (event) {
      this.dragging = true;
      var dataTransfer = event.dataTransfer;
      var effect = dataTransfer.effectAllowed;
      dataTransfer.dropEffect = "move" === effect || "linkMove" === effect ? "move" : "copy";
    },

    onDrop: function (event) {
      this.dragging = false;
      var file = event.dataTransfer && event.dataTransfer.files[0];
      if (file) {
        this.readFile(file);
      }
    },

    onPaste: function (event) {
      var self = this;
      var items = Array.from((event.clipboardData && event.clipboardData.items) || []);
      var item = items.find(function (i) { return i.type == 'text/plain'; });
      if (!item) {
        return;
      }
      item.getAsString(function (text) {
        self.loadCsv(text);
      });
    },

    // --- output -----------------------------------------------------------

    csvString: function () {
      return this.data_object.converted_csv(null, this.ynab_cols, this.ynab_map, this.inverted_outflow, this.normalize_date);
    },

    reloadApp: function () {
      this.setInitialState();
    },

    downloadFile: function () {
      var a = document.createElement("a");
      // UTF-8 encode, then base64
      a.href = "data:attachment/csv;base64," + btoa(unescape(encodeURIComponent(this.csvString())));
      a.target = "_blank";
      a.download = "ynab_data_" + new Date().yyyymmdd() + ".csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };
}

document.addEventListener('alpine:init', function () {
  window.Alpine.data('ynabApp', ynabApp);
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ynabApp: ynabApp, defaultProfile: defaultProfile, old_ynab_cols: old_ynab_cols, new_ynab_cols: new_ynab_cols };
}
