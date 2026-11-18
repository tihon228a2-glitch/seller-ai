const express = require('express');
const path = require('path');
const app = express();
app.use(express.json({limit:'1mb'}));
app.use(express.static(path.join(__dirname,'public')));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'SELLER AI'}));
app.post('/api/generate',async(req,res)=>{
  const {platform='Wildberries',name='',category='',features='',audience='для повседневного использования',tone='Убедительный и понятный'}=req.body||{};
  if(!name.trim()) return res.status(400).json({error:'Название товара обязательно'});
  const base=process.env.AI_BASE_URL, key=process.env.AI_API_KEY, model=process.env.AI_MODEL;
  if(base&&key&&model){
    try{
      const response=await fetch(base.replace(/\/$/,'')+'/chat/completions',{
        method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
        body:JSON.stringify({model,temperature:0.7,messages:[
          {role:'system',content:'Ты помощник продавца маркетплейса. Создавай честный текст карточки на русском. Не выдумывай свойства. Верни только JSON: title, description, benefits (array), keywords.'},
          {role:'user',content:JSON.stringify({platform,name,category,features,audience,tone})}
        ]})
      });
      if(!response.ok) throw new Error('AI provider error');
      const data=await response.json();
      let content=data.choices?.[0]?.message?.content||'';
      content=content.replace(/^```json\s*/i,'').replace(/```$/,'').trim();
      return res.json({result:JSON.parse(content)});
    }catch(e){console.error('AI generation failed:',e.message);}
  }
  const title=`${name} — практичный выбор на каждый день`.slice(0,120);
  const description=`${name} подойдёт ${audience}. ${features||'Перед покупкой ознакомьтесь с характеристиками и комплектацией.'}`;
  const benefits=(features?features.split(/[,.;\n]+/).map(x=>x.trim()).filter(Boolean).slice(0,5):['Практичное решение на каждый день','Удобно для повседневных задач']);
  const keywords=[name,category,...name.toLowerCase().split(/\s+/),'для дома','подарок'].filter(Boolean);
  res.json({result:{title,description,desc:description,benefits,keywords:keywords.join(', '),demo:true}});
});
const port=process.env.PORT||3000;
app.listen(port,()=>console.log(`SELLER AI running on port ${port}`));