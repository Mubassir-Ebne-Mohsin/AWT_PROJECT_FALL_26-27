import json
from pathlib import Path
import pdfplumber
folder=Path(__file__).resolve().parent
results=[]
for name in ['report','landscape','long','admin','print-shared']:
 with pdfplumber.open(folder/(name+'.pdf')) as pdf:
  for i,p in enumerate(pdf.pages):
   text=p.extract_text() or ''
   words=p.extract_words()
   logos=[w for w in words if w['text']=='STRESSFORGE.']
   assert len(logos)==1,(name,i,'logo count',logos,text[:100])
   logo=logos[0]
   assert logo['x0']>p.width/2 and logo['top']<40,(name,i,'logo position',logo)
   assert '© 2026 STRESSFORGE' in text,(name,i,'source missing',text[-200:])
   credits=[w for w in words if w['text']=='©']
   assert len(credits)==1 and credits[0]['top']>p.height-40,(name,i,'source placement',credits)
   assert all(0<=w['x0'] and w['x1']<=p.width+1 for w in words),(name,i,'text clipped horizontally')
  results.append({'name':name,'pages':len(pdf.pages),'everyPageLogoAndSource':True})
(folder/'inspection.json').write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
print(json.dumps(results))
