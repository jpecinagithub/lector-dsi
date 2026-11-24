import zipfile, re, html, json
src='/home/hatch/workspace/user/files/Pobreza_y_riqueza_y_doctrina_social_de_la_Iglesia.epub'
z=zipfile.ZipFile(src)
titles=[
 ("Presentación","Presentación del volumen"),
 ("I. Las raíces bíblicas y patrísticas del pensamiento social católico sobre negocios y el comercio","Martin Schlag"),
 ("II. La pobreza es un problema humano muy complejo","Cristian Mendoza"),
 ("III. La verdad de la pobreza y la verdad de la riqueza","Rafael Alvira"),
 ("IV. «No me gusta la palabra capitalismo»","Entrevista a Samuel Gregg"),
 ("V. Michael Novak. ¿Un capitalismo católico?","Miguel A. Martínez Echevarría"),
 ("VI. El papel positivo de la empresa virtuosa en la vida económica","Martin Schlag"),
 ("VII. ¿Son las finanzas una «estructura de pecado»?","Gregorio Guitián"),
 ("VIII. Sobre la confianza","Richard Brisebois"),
 ("IX. Naturaleza y características de la doctrina social de la Iglesia","Domènec Melé"),
]
chapters=[]
for i in range(1,11):
    data=z.read(f'EPUB/text/ch{i:03d}.xhtml').decode()
    # convert headings and paragraphs to line blocks
    data=re.sub(r'<h([1-3])[^>]*>', r'\n@@H\1@@ ', data)
    data=re.sub(r'</h[1-3]>','\n',data)
    data=re.sub(r'<p[^>]*>','\n@@P@@ ',data)
    data=re.sub(r'<li[^>]*>','\n@@P@@ • ',data)
    data=re.sub(r'<blockquote[^>]*>','\n@@P@@ ',data)
    txt=re.sub(r'<[^>]+>',' ',data); txt=html.unescape(txt)
    lines=[]
    for raw in txt.split('\n'):
        s=re.sub(r'\s+',' ',raw).strip()
        if s: lines.append(s)
    # drop first line if it's filename artifact
    if lines and lines[0].startswith('ch0'): lines=lines[1:]
    # split reflection
    refl=[]; body=[]
    mode='body'
    for ln in lines:
        clean=ln.replace('@@H1@@ ','').replace('@@H2@@ ','').replace('@@H3@@ ','').replace('@@P@@ ','')
        if clean.strip()=='Preguntas para la reflexión':
            mode='refl'; continue
        if mode=='refl':
            # footnotes start when line looks like numbered reference block after 5 questions - stop when we have 5 and line is long footnote
            if re.match(r'^\d+\s*[.·]', clean) or re.match(r'^\d+\s', clean):
                q=re.sub(r'^\d+\s*[.·]?\s*','',clean).strip()
                if len(q)>25 and q.endswith('?'):
                    refl.append(q); continue
                else:
                    break
            if clean.endswith('?'):
                refl.append(clean); continue
            break
        body.append(ln)
    sections=[]; cur={"heading":None,"paragraphs":[]}
    first=True
    for ln in body:
        if ln.startswith('@@H'):
            if cur["paragraphs"] or cur["heading"]: sections.append(cur)
            cur={"heading":re.sub(r'@@H[123]@@ ','',ln).strip(),"paragraphs":[]}
        else:
            p=ln.replace('@@P@@ ','').strip()
            if not p: continue
            if first and p==titles[i-1][0]: first=False; continue
            first=False
            # skip author line duplicates
            if p in (titles[i-1][1], titles[i-1][1].upper()): continue
            cur["paragraphs"].append(p)
    if cur["paragraphs"] or cur["heading"]: sections.append(cur)
    words=sum(len(p.split()) for s in sections for p in s["paragraphs"])
    chapters.append({"id":i,"title":titles[i-1][0],"author":titles[i-1][1],"words":words,"minutes":max(1,round(words/180)),"sections":sections,"reflection":refl})
    print(i, titles[i-1][0][:50], 'words',words,'sections',len(sections),'refl',len(refl))
out={"title":"Pobreza, riqueza y doctrina social de la Iglesia","subtitle":"Una colección de estudios sobre pobreza, riqueza, empresa y finanzas a la luz de la doctrina social de la Iglesia","authors":["Martin Schlag","Cristian Mendoza","Rafael Alvira","Samuel Gregg","Miguel A. Martínez Echevarría","Gregorio Guitián","Richard Brisebois","Domènec Melé"],"chapters":chapters}
open('/home/hatch/workspace/lector-dsi/src/data/book.json','w').write(json.dumps(out,ensure_ascii=False))
print('total words', sum(c['words'] for c in chapters))
