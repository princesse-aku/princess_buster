// Point d'entrée commun desktop + mobile (Android/iOS).
// Le jeu (public/) est une page web ; la base SQLite des joueurs/scores passe par le plugin SQL
// (voir public/js/storage.js, mêmes tables que server/server.js).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Princess Buster");
}
