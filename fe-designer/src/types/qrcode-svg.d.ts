declare module 'qrcode-svg' {
  type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';
  interface QRCodeOptions {
    content: string;
    padding?: number;
    width?: number;
    height?: number;
    color?: string;
    background?: string;
    ecl?: ErrorCorrectionLevel;
  }
  export default class QRCode {
    constructor(options: QRCodeOptions);
    svg(): string;
  }
}
