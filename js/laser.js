// Télémètres laser Bluetooth (Web Bluetooth, Chrome Android).
// Leica DISTO : service 3ab10100…, la distance arrive en float32 (mètres).
// Bosch GLM (série C) : service 02a6c0d0…, trame C0 55 10 … distance float32 à l'octet 7.
// Les autres lasers en mode « clavier Bluetooth » tapent directement dans le champ de saisie.

const LEICA_SVC = '3ab10100-f831-4395-b29d-570977d5bf94';
const LEICA_DIST = '3ab10101-f831-4395-b29d-570977d5bf94';
const BOSCH_SVC = '02a6c0d0-0451-4000-b000-fb3210111989';
const BOSCH_CHR = '02a6c0d1-0451-4000-b000-fb3210111989';

let device = null;
let onMesure = () => {};
let onEtat = () => {};

export const laserDisponible = () => 'bluetooth' in navigator;
export const laserConnecte = () => !!device?.gatt?.connected;
export function surMesure(fn) { onMesure = fn; }
export function surEtat(fn) { onEtat = fn; }

export async function connecterLaser() {
  if (!laserDisponible()) throw new Error("Le Bluetooth n'est pas accessible dans ce navigateur. Utilisez Chrome sur la tablette, ou le laser en mode clavier.");
  device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [LEICA_SVC] }, { services: [BOSCH_SVC] }, { namePrefix: 'DISTO' }, { namePrefix: 'GLM' }],
    optionalServices: [LEICA_SVC, BOSCH_SVC],
  });
  device.addEventListener('gattserverdisconnected', () => onEtat('deconnecte', device?.name));
  const gatt = await device.gatt.connect();
  const services = await gatt.getPrimaryServices();
  const uuids = services.map(s => s.uuid);
  if (uuids.includes(LEICA_SVC)) {
    const ch = await (await gatt.getPrimaryService(LEICA_SVC)).getCharacteristic(LEICA_DIST);
    ch.addEventListener('characteristicvaluechanged', e => {
      const v = e.target.value.getFloat32(0, true);
      if (v > 0 && v < 300) onMesure(v);
    });
    await ch.startNotifications();
  } else if (uuids.includes(BOSCH_SVC)) {
    const ch = await (await gatt.getPrimaryService(BOSCH_SVC)).getCharacteristic(BOSCH_CHR);
    ch.addEventListener('characteristicvaluechanged', e => {
      const dv = e.target.value;
      if (dv.byteLength >= 11 && dv.getUint8(0) === 0xC0 && dv.getUint8(1) === 0x55 && dv.getUint8(2) === 0x10) {
        const v = dv.getFloat32(7, true);
        if (v > 0 && v < 300) onMesure(v);
      }
    });
    await ch.startNotifications();
    // active l'envoi automatique de chaque mesure
    await ch.writeValue(new Uint8Array([0xC0, 0x55, 0x02, 0x01, 0x00, 0x1A]));
  } else {
    throw new Error('Laser connecté mais protocole inconnu. Passez-le en mode clavier Bluetooth.');
  }
  onEtat('connecte', device.name);
  return device.name;
}

export function deconnecterLaser() {
  device?.gatt?.disconnect();
  device = null;
  onEtat('deconnecte');
}
