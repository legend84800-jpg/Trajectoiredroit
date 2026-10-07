const {parentPort,workerData}=require('node:worker_threads');
(async()=>{
  let pdf;
  try {
    const {getDocumentProxy,extractText}=await import('unpdf');
    pdf=await getDocumentProxy(new Uint8Array(workerData),{
      isEvalSupported:false,maxImageSize:16000000,useSystemFonts:false,disableFontFace:true
    });
    if (pdf.numPages>15) throw new Error('pages');
    const result=await extractText(pdf,{mergePages:true});
    const text=result.text.trim();
    if (text.length>30000) throw new Error('caracteres');
    if (text.length<20) throw new Error('sans_texte');
    parentPort.postMessage({pages:pdf.numPages,texte:text});
  } catch(error) { parentPort.postMessage({erreur:error.message}); }
  finally { if(pdf) await pdf.destroy(); }
})();
