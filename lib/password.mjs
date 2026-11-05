import {randomBytes} from 'node:crypto';
export const newPassword=()=> 'C'+randomBytes(12).toString('base64url');
