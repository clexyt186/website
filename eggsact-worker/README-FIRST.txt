EGGSACT Worker - replacement folder
Developed for Clexyt (Cletus Mulaudi)

HOW TO INSTALL
  1. Rename your existing "eggsact-worker" folder to "eggsact-worker-backup".
     (Don't delete it. If anything goes wrong, delete the new one and rename
     this back - 30 seconds, and it makes the swap safe.)
  2. Put this folder in its place, named "eggsact-worker".
  3. Copy icon-192.png and icon-512.png out of the backup's icons folder into
     this one's icons folder, then delete PUT-YOUR-ICONS-HERE.txt.
  4. Upload / deploy the site as usual.

WHAT CHANGED

  The server address. It was "http://127.0.0.1:5085" - which means "this
  phone itself", so login, sync, master download, messages and team data
  could never work on any device except the PC running the server. It now
  points at https://purse-delta-humming.ngrok-free.dev. This one line is why
  nothing worked. A stale localhost address saved on a phone from the old
  build is also cleared automatically, otherwise updating wouldn't help.

  House Judi added to the house list.

  Local master file. "Load latest" downloads a house's master onto the
  device; "Export full file" then hands back that whole file with your own
  not-yet-synced entries written into their correct cells - and it works
  offline. Only entries that haven't synced yet are written in, because a
  freshly downloaded master already contains everything that has.

  Formulas survive. The master holds 17,420 live formulas (weekly rollups,
  %HDE, the FCR chain). The bundled SheetJS reads NONE of them, so rewriting
  the workbook would have stripped every one. Instead, js/xlsx-patch.js edits
  the individual cells inside the .xlsx zip and leaves every other byte
  exactly as the home PC wrote it. Checked: 17,420 formulas before, 17,420
  after.

  Service worker is now v3 and network-first, so future updates actually
  reach phones that already installed the app. The old cache-first rule could
  leave a phone on an old build indefinitely.

FILES
  index.html            replaced
  service-worker.js     replaced
  manifest.json         unchanged
  css/style.css         replaced (master-card styles added)
  js/app.js             replaced
  js/db.js              replaced (stores the master file)
  js/sync.js            replaced (refresh + master export)
  js/master.js          NEW - decides which cell each entry belongs in
  js/xlsx-patch.js      NEW - edits cells inside the .xlsx without rebuilding
  js/autocorrect.js     unchanged
  js/xlsx-export.js     unchanged
  js/vendor/xlsx.full.min.js   unchanged (your own copy)
  js/vendor/fflate.min.js      NEW - 36 KB zip library, works offline
  icons/                YOURS - copy them in, see step 3

CHECK IT WORKED, IN THIS ORDER
  1. Hard-refresh the site, open the browser console. A red 404 naming
     fflate.min.js, master.js or xlsx-patch.js means that file landed in the
     wrong folder.
  2. Log in. If login succeeds, the server address fix is live.
  3. My Data tab - each house you have full access to shows a card with
     "Load latest" and "Export full file".
  4. Load latest. It should report a size in KB.
  5. Export full file, open it in Excel, confirm a rollup column still shows
     a formula rather than a bare number.

ALSO UPDATE ON THE HOME PC
  sync_import.py and feed_engine.py, delivered alongside this. They fix feed
  syncs creating a duplicate week block (your pre-stamped weeks are labelled
  94W with the date range in row 1; the importer was looking for "04Aug" and
  making a second block for a week that already existed), and a crash when
  importing a file by full path.
