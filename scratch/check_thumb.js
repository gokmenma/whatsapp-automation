import fs from 'node:fs';
import { proto } from '@whiskeysockets/baileys';

const path = 'c:/Users/HP/Desktop/svelte-app/media/19dc2193-0b5f-4c24-9c9e-93561e29dcf9/raw/ACD512034F32EAE82144001FFA02A6F8.bin';

try {
    const bytes = fs.readFileSync(path);
    const decoded = proto.WebMessageInfo.decode(bytes);
    console.log('Decoded message:', JSON.stringify(decoded, (key, value) => 
        key === 'jpegThumbnail' ? '<BUFFER>' : value
    , 2));
    
    const content = decoded.message?.documentMessage;
    if (content?.jpegThumbnail) {
        console.log('Thumbnail found! Size:', content.jpegThumbnail.length);
        fs.writeFileSync('c:/Users/HP/Desktop/svelte-app/media/test_thumb.jpg', content.jpegThumbnail);
    } else {
        console.log('No thumbnail found in documentMessage');
    }
} catch (e) {
    console.error('Error:', e);
}
