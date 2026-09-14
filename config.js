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

export const LOCATION_OPTIONS = [
  'REST AREA',
  'SECURITY POS 1',
  'HSE YARD',
  'CLINIC',
  'HRD',
  'PAYROLL',
  'KUTEI OFFICE',
  'WELDING SCHOOL',
  'GREEN OFFICE',
  'PCC OFFICE',
  'BLUE OFFICE',
  'WHITE OFFICE LT1',
  'WHITE OFFICE LT2',
  'WHITE OFFICE LT3',
  'CONTROL ROOM',
  'RED OFFICE',
  'WAREHOUSE',
  'MAINTENANCE',
  'WORKSHOP 1',
  'WORKSHOP 2',
  'WORKSHOP 3',
  'WORKSHOP 4',
  'WORKSHOP 5',
  'WORKSHOP 6',
  'WORKSHOP 7',
  'WORKSHOP 8',
  'WORKSHOP 9',
  'WORKSHOP 10',
  'WORKSHOP 11',
  'WORKSHOP 12',
  'WORKSHOP 13',
  'WORKSHOP 14',
  'BLASTING PAINTING',
  'JETTY AREA',
  'AIS SERVER',
  'RIGGING OFFICE',
  'STORE 1',
  'STORE 2',
  'STORE 3',
  'STORE 4',
  'STORE 5',
  'OTHER LOCATION'
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
