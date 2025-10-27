const DEVICE_ID_KEY = 'eResusDeviceId';

export function getDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    console.log("Generated new Device ID:", deviceId);
  } else {
    console.log("Using existing Device ID:", deviceId);
  }
  return deviceId;
}
