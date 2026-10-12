import json,glob,sys
out=[];stat={}
for f in sorted(glob.glob('brands/*.json')):
    try: d=json.load(open(f))
    except Exception as e: print('FEHLER',f,e); continue
    if isinstance(d,dict): d=d.get('articles') or d.get('items') or [d]
    for a in d:
        if not a.get('name') or not a.get('price_eur'): print('übersprungen',f,a.get('name')); continue
        cols=[]
        for c in a.get('colors',[]) or []:
            imgs=[u for u in (c.get('images') or []) if isinstance(u,str) and u.startswith('http')]
            cols.append({'name':c.get('name') or 'Standard','images':imgs[:6]})
        a['colors']=cols[:4] or [{'name':'Standard','images':[]}]
        out.append(a); stat[a['brand']]=stat.get(a['brand'],0)+1
json.dump(out,open('brand_catalog.json','w'),ensure_ascii=False,separators=(',',':'))
print(len(out),'Artikel',stat)
print(sum(len(c['images']) for a in out for c in a['colors']),'Bilder')
