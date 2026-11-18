import {decode} from '@msgpack/msgpack';

export const IMAGE_API='https://image.novelai.net';
export const V5_MODELS=[['NovelAI V5 Full','nai-diffusion-5-full'],['NovelAI V5 Curated','nai-diffusion-5-curated']];
export const isV5Model=model=>V5_MODELS.some(([,id])=>id===model);
export const MAX_IMAGE_BYTES=9_500_000;
const MAX_STREAM_BYTES=128_000_000;

export async function readV5Images(response,count) {
  if(!response.body)throw Error('invalid_image_response');
  const reader=response.body.getReader();
  const images=new Map();
  let chunk=new Uint8Array(0),offset=0,streamBytes=0,imageBytes=0;
  async function readBytes(length) {
    const buffer=new Uint8Array(length);
    let written=0;
    while(written<length) {
      if(offset===chunk.length) {
        const {done,value}=await reader.read();
        if(done)throw Error('incomplete_image_stream');
        streamBytes+=value.length;
        if(streamBytes>MAX_STREAM_BYTES)throw Error('image_stream_too_large');
        chunk=value;
        offset=0;
      }
      const size=Math.min(length-written,chunk.length-offset);
      buffer.set(chunk.subarray(offset,offset+size),written);
      written+=size;
      offset+=size;
    }
    return buffer;
  }
  try {
    while(images.size<count) {
      const header=await readBytes(4);
      const length=new DataView(header.buffer).getUint32(0);
      if(!length||length>MAX_IMAGE_BYTES+65_536)throw Error('invalid_image_frame_size');
      const event=decode(await readBytes(length),{
        maxStrLength:65_536,maxBinLength:MAX_IMAGE_BYTES,maxArrayLength:1024,maxMapLength:256,maxExtLength:0
      });
      if(event?.event_type==='error')throw Error('novelai_stream_error');
      if(event?.event_type!=='final')continue;
      const {samp_ix:index,image}=event;
      if(!Number.isInteger(index)||index<0||index>=count||images.has(index)||!(image instanceof Uint8Array))throw Error('invalid_image_response');
      imageBytes+=image.length;
      if(imageBytes>MAX_IMAGE_BYTES)throw Error('image_response_too_large');
      images.set(index,image);
    }
    return Array.from({length:count},(_,index)=>images.get(index));
  } finally {
    await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}

export async function readV5Quota(apiKey,fetcher=fetch) {
  if(!apiKey)return '红小豆的 NovelAI 账号尚未配置。';
  try {
    const response=await fetcher(IMAGE_API+'/user/subscription',{
      method:'GET',headers:{Authorization:'Bearer '+apiKey,Accept:'application/json'},
      redirect:'error',signal:AbortSignal.timeout(8000)
    });
    if(!response.ok)return `V5 额度查询失败（NovelAI HTTP ${response.status}）。`;
    const subscription=await response.json();
    const usage=subscription?.usage;
    if(!usage) {
      if(subscription?.active===false)return '红小豆的 NovelAI 账号没有有效订阅。';
      if(subscription?.active===true&&Number.isInteger(subscription.tier)&&subscription.tier<3)return '红小豆当前的 NovelAI 订阅没有 Opus V5 额度。';
      return 'NovelAI 暂未返回红小豆账号的 V5 额度。';
    }
    const {percent,isNegative,purchasedPercent,timeUntilNextPercent}=usage;
    if(!Number.isFinite(percent)||percent<0)return 'NovelAI 暂未返回有效的 V5 额度。';
    const lines=['**红小豆 · NovelAI V5 共享额度**',`剩余 ${percent}%${isNegative===true?'（当前暂不可用）':''}`];
    if(Number.isFinite(purchasedPercent)&&purchasedPercent>=0)lines.push(`额外额度 ${purchasedPercent}%`);
    if(Number.isFinite(timeUntilNextPercent)&&timeUntilNextPercent>0) {
      lines.push(`预计再恢复 1% <t:${Math.ceil(Date.now()/1000+timeUntilNextPercent)}:R>`);
    }
    return lines.join('\n');
  } catch {
    return '暂时无法读取 NovelAI V5 额度，请稍后再试。';
  }
}
