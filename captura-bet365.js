// ===== SONDA 2 v2 — resultados rapidos com AUTO-ATUALIZACAO (colar no console da pagina de RESULTADOS) =====
(function(){
  if(window.__sonda2){console.log("sonda2 ja ativa — recarregue a pagina para trocar de versao");return;}
  window.__sonda2=true;
  const SRV="https://mr-betlive.onrender.com/api/snapshot2";
  const vistos=new Set();
  function parseTexto(txt){
    const jogos=[];
    const re1=/([A-Za-zÀ-ÿ0-9'. ]{3,28}?)\s+(\d{1,2})\s*[-–x:]\s*(\d{1,2})\s+([A-Za-zÀ-ÿ0-9'. ]{3,28})/g;
    let m;
    while((m=re1.exec(txt))!==null){
      const casa=m[1].trim(),fora=m[4].trim();
      if(casa.length<3||fora.length<3)continue;
      jogos.push({casa,fora,a:m[2],b:m[3],horario:null});
    }
    const linhas=txt.split("\n").map(s=>s.trim()).filter(Boolean);
    for(let i=1;i+1<linhas.length;i++){
      const sc=linhas[i].match(/^(\d{1,2})\s*[-–x:]\s*(\d{1,2})$/);
      if(sc&&linhas[i-1].length>=3&&linhas[i-1].length<=28&&linhas[i+1].length>=3&&linhas[i+1].length<=28){
        jogos.push({casa:linhas[i-1],fora:linhas[i+1],a:sc[1],b:sc[2],horario:null});
      }
    }
    return jogos;
  }
  async function coleta(){
    // 1) DOM ao vivo (se a pagina se atualiza sozinha)
    let jogos=parseTexto(document.body.innerText||"");
    // 2) AUTO-ATUALIZACAO: busca a propria pagina de novo (cookies inclusos) e le o HTML fresco
    try{
      const r=await fetch(location.href,{credentials:"include",cache:"no-store"});
      const html=await r.text();
      const txt=html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g,"\n");
      jogos=jogos.concat(parseTexto(txt));
    }catch(e){}
    return jogos;
  }
  async function envia(){
    try{
      const todos=await coleta();
      const novos=[];const chaves=new Set();
      for(const j of todos){
        const k=j.casa+"|"+j.a+"-"+j.b+"|"+j.fora;
        if(chaves.has(k))continue;chaves.add(k);
        if(vistos.has(k))continue;vistos.add(k);
        novos.push(j);
      }
      window.__s2Diag={naPagina:todos.length,novosNesteCiclo:novos.length,totalJaEnviados:vistos.size,hora:new Date().toLocaleTimeString()};
      if(!novos.length)return;
      const r=await fetch(SRV,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jogos:novos.slice(-20)})});
      const j=await r.json();
      window.__s2Diag.casados=j.casados;
      console.log("sonda2:",novos.length,"novos →",j.casados,"casados");
    }catch(e){window.__s2Diag={erro:e.message};}
  }
  setInterval(envia,15000);
  envia();
  console.log("🛰️ SONDA 2 v2 ATIVA — auto-atualização a cada 15s. Diagnóstico: window.__s2Diag");
})();
