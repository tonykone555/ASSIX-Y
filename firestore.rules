rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Public access for development and API-key-based backend access
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
