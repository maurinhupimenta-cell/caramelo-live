// ===== SONDA 2 — resultados rapidos (colar no console da pagina de RESULTADOS do futebol virtual) =====
(function(){
  if(window.__sonda2){console.log("sonda2 ja ativa");return;}
  window.__sonda2=true;
  const SRV="https://mr-betlive.onrender.com/api/snapshot2";
  const vistos=new Set();
  function extrai(){
    const jogos=[];
    const txt=document.body.innerText||"";
    // padrao 1: "Casa 2-1 Fora" na mesma linha
    const re1=/([A-Za-zÀ-ÿ0-9'. ]{3,28}?)\s+(\d{1,2})\s*[-–x:]\s*(\d{1,2})\s+([A-Za-zÀ-ÿ0-9'. ]{3,28})/g;
    let m;
    while((m=re1.exec(txt))!==null){
      const casa=m[1].trim(),fora=m[4].trim();
      if(casa.length<3||fora.length<3)continue;
      jogos.push({casa,fora,a:m[2],b:m[3],horario:null});
    }
    // padrao 2: blocos em linhas separadas Casa \n a-b \n Fora (fallback)
    const linhas=txt.split("\n").map(s=>s.trim()).filter(Boolean);
    for(let i=1;i+1<linhas.length;i++){
      const sc=linhas[i].match(/^(\d{1,2})\s*[-–x:]\s*(\d{1,2})$/);
      if(sc&&linhas[i-1].length>=3&&linhas[i-1].length<=28&&linhas[i+1].length>=3&&linhas[i+1].length<=28){
        jogos.push({casa:linhas[i-1],fora:linhas[i+1],a:sc[1],b:sc[2],horario:null});
      }
    }
    return jogos;
  }
  async function envia(){
    try{
      const todos=extrai();
      const novos=todos.filter(j=>{const k=j.casa+"|"+j.a+"-"+j.b+"|"+j.fora;if(vistos.has(k))return false;vistos.add(k);return true;}).slice(-15);
      window.__s2Diag={naPagina:todos.length,novos:novos.length,hora:new Date().toLocaleTimeString()};
      if(!novos.length)return;
      const r=await fetch(SRV,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jogos:novos})});
      const j=await r.json();
      window.__s2Diag.casados=j.casados;
      console.log("sonda2:",novos.length,"novos →",j.casados,"casados");
    }catch(e){window.__s2Diag={erro:e.message};}
  }
  setInterval(envia,12000);
  envia();
  console.log("🛰️ SONDA 2 ATIVA — resultados rapidos a cada 12s. Diagnostico: window.__s2Diag");
})();
