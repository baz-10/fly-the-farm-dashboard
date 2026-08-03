const {validateLogoFile}=require('../../server/report-file-validator');

const png=()=>{const b=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(b);b.writeUInt32BE(320,16);b.writeUInt32BE(120,20);return b;};
const jpeg=()=>Buffer.from('ffd8ffc00011080078014003011100021100031100ffd9','hex');
const webp=()=>{const b=Buffer.alloc(30);b.write('RIFF',0);b.writeUInt32LE(22,4);b.write('WEBPVP8X',8);b.writeUIntLE(319,24,3);b.writeUIntLE(119,27,3);return b;};

test.each([
  ['image/png',png()],
  ['image/jpeg',jpeg()],
  ['image/webp',webp()],
])('accepts decoded %s logos and returns authoritative metadata',async(contentType,bytes)=>{
  await expect(validateLogoFile({bytes,declaredContentType:contentType,fileName:`logo.${contentType.split('/')[1]}`})).resolves.toEqual(expect.objectContaining({contentType,width:320,height:120,checksum:expect.stringMatching(/^[a-f0-9]{64}$/),byteSize:bytes.length}));
});

test('rejects SVG, mismatched signatures, oversized and extreme dimensions',async()=>{
  await expect(validateLogoFile({bytes:Buffer.from('<svg><script/></svg>'),declaredContentType:'image/svg+xml',fileName:'logo.svg'})).rejects.toMatchObject({code:'UNSUPPORTED_LOGO'});
  await expect(validateLogoFile({bytes:png(),declaredContentType:'image/jpeg',fileName:'logo.jpg'})).rejects.toMatchObject({code:'LOGO_TYPE_MISMATCH'});
  const huge=png();huge.writeUInt32BE(6001,16);
  await expect(validateLogoFile({bytes:huge,declaredContentType:'image/png',fileName:'logo.png'})).rejects.toMatchObject({code:'LOGO_DIMENSIONS_INVALID'});
  await expect(validateLogoFile({bytes:Buffer.alloc(5*1024*1024+1),declaredContentType:'image/png',fileName:'logo.png'})).rejects.toMatchObject({code:'LOGO_TOO_LARGE'});
});
