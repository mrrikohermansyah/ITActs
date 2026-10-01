import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA5bu9VIFKtrjJfU0vLSH5PSrNtOXoLmUg",
  authDomain: "itacts-6231e.firebaseapp.com",
  projectId: "itacts-6231e",
  storageBucket: "itacts-6231e.firebasestorage.app",
  messagingSenderId: "986253013988",
  appId: "1:986253013988:web:ed29bf8df2a4413af60df1",
  measurementId: "G-KM67HKRP2P"
};

export const firebaseApp = initializeApp(firebaseConfig);

// Sentinel opsi "Other Location": nilainya harus sama persis dengan value
// <option> yang dihasilkan populateSelect, karena banyak logic membandingkannya.
export const OTHER_LOCATION = 'Other Location';

export const LOCATION_OPTIONS = [
  'Rest Area',
'Security Pos 1',
'Hse Yard',
'Clinic',
'Hrd',
'Payroll',
'Kutei Office',
'Welding School',
'Green Office',
'Pcc Office',
'Blue Office',
'White Office Lt1',
'White Office Lt2',
'White Office Lt3',
'Control Room',
'Red Office',
'Warehouse',
'Maintenance',
'Workshop 1',
'Workshop 2',
'Workshop 3',
'Workshop 4',
'Workshop 5',
'Workshop 6',
'Workshop 7',
'Workshop 8',
'Workshop 9',
'Workshop 10',
'Workshop 11',
'Workshop 12',
'Workshop 13',
'Workshop 14',
'Blasting Painting',
'Jetty Area',
'Ais Server',
'Rigging Office',
'Store 1',
'Store 2',
'Store 3',
'Store 4',
'Store 5',
  OTHER_LOCATION
];

export const WORK_CODES = [
  { code: 'HW', label: '' },
  { code: 'SW', label: '' },
  { code: 'KB', label: '' },
  { code: 'OT', label: '' },
  { code: 'NW', label: '' },
  { code: 'MV', label: '' },
  { code: 'DR', label: '' }
];

export const APP_NAME = 'ActLog';

/*
  Catatan penting:
  - apiKey Firebase untuk web memang bersifat publik. Ini bukan secret untuk aplikasi web.
  - Keamanan aplikasi benar-benar diatur lewat Firestore Security Rules dan Firebase Auth.
  - File ini dipisahkan agar konfigurasi lebih rapi dan mudah diganti saat deploy.
*/
