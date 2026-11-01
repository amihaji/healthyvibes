// Restore selalu ke salinan staging. ID produksi tidak pernah diganti otomatis.
function restoreStaging_(user, data) {
  const backup = rows_('BackupLog').find(function (row) {
    return row.folderId === data.folderId && row.status === 'COMPLETED';
  });
  if (!backup || data.confirmation !== 'RESTORE KE STAGING') {
    throw new Error('Pilih backup selesai dan ketik RESTORE KE STAGING.');
  }
  const source = DriveApp.getFolderById(backup.folderId);
  const manifests = source.getFilesByName('manifest.json');
  if (!manifests.hasNext()) {
    throw new Error('Manifest backup tidak ditemukan.');
  }
  const manifest = JSON.parse(manifests.next().getBlob().getDataAsString());
  if (manifest.databaseId !== backup.databaseFileId || manifest.version !== 1) {
    throw new Error('Manifest backup tidak sesuai.');
  }
  const destination = DriveApp.getFolderById(
    PropertiesService.getScriptProperties().getProperty('ROOT_FOLDER_ID')
  ).createFolder('RESTORE-STAGING-' + now_().replace(/[:.]/g, '-'));
  const restored = DriveApp.getFileById(manifest.databaseId)
    .makeCopy('Healthy Vibes - STAGING', destination);
  const mappings = {};
  const folders = {};
  Object.keys(manifest.folders).forEach(function (kind) {
    folders[kind] = destination.createFolder(kind).getId();
  });
  manifest.files.forEach(function (entry) {
    const copy = DriveApp.getFileById(entry.backupId)
      .makeCopy(entry.name, DriveApp.getFolderById(folders[entry.kind]));
    mappings[entry.originalId] = copy.getId();
  });
  const db = SpreadsheetApp.openById(restored.getId());
  // Relasi berkas diperbarui agar staging tidak menunjuk berkas produksi.
  [
    ['Products', 'photoFileId'],
    ['Orders', 'invoiceFileId'],
    ['Files', 'driveFileId']
  ].forEach(function (pair) {
    const sheet = db.getSheetByName(pair[0]);
    if (!sheet || sheet.getLastRow() < 2) {
      return;
    }
    const column = HV_SCHEMA[pair[0]].indexOf(pair[1]) + 1;
    const range = sheet.getRange(2, column, sheet.getLastRow() - 1, 1);
    range.setValues(range.getValues().map(function (row) {
      return [row[0] ? mappings[row[0]] || '' : ''];
    }));
  });
  const settings = db.getSheetByName('Settings');
  const values = settings.getRange(2, 1, settings.getLastRow() - 1, 2).getValues();
  values.forEach(function (row) {
    if (row[0] === 'ordersEnabled' || row[0] === 'deliveryVerified') {
      row[1] = 'false';
    }
    if (row[0] === 'logoFileId' || row[0] === 'qrisFileId') {
      row[1] = mappings[row[1]] || '';
    }
  });
  settings.getRange(2, 1, values.length, 2).setValues(values);
  const sessions = db.getSheetByName('Sessions');
  if (sessions.getLastRow() > 1) {
    sessions.getRange(2, HV_SCHEMA.Sessions.indexOf('revoked') + 1, sessions.getLastRow() - 1, 1)
      .setValues(Array.from({ length: sessions.getLastRow() - 1 }, function () { return [true]; }));
  }
  destination.createFile('konfigurasi-staging.json', JSON.stringify({
    DATABASE_ID: restored.getId(),
    ROOT_FOLDER_ID: destination.getId(),
    folders: folders,
    note: 'Rahasia keamanan tidak ada di backup. Pasang hanya pada project staging terpisah.'
  }), 'application/json');
  audit_(user, 'RESTORE_STAGING', backup.id, 'Produksi tidak diubah.');
  return {
    databaseUrl: db.getUrl(),
    folderUrl: 'https://drive.google.com/drive/folders/' + destination.getId()
  };
}

// Opsional: dijalankan pemilik setelah uji backup berhasil, bukan saat install.
function enableDailyBackup_() {
  const existing = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === 'dailyBackup_';
  });
  if (!existing) {
    ScriptApp.newTrigger('dailyBackup_')
      .timeBased()
      .atHour(2)
      .everyDays(1)
      .inTimezone('Asia/Makassar')
      .create();
  }
  return 'Backup harian aktif sekitar pukul 02 WITA; pantau BackupLog.';
}

function dailyBackup_() {
  return withLock_(function () {
    return backup_({ id: 'SYSTEM' });
  });
}
