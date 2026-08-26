#!/usr/bin/env python3
"""D-531 fence (s49 v2, quote-aware): sha256 of raw captured text for 5 head fields on the 6 fenced pages; compare to the s49 baseline."""
import re,hashlib,sys
BASE={'blog/puerto-rico-vs-hawaii.html':dict(title='60af18da2d94e276042b216c0da0c318654f5d960f53f430ffd354927a55ebf7',meta_desc='ffd5031f9a3b7bbc85b42b48443f9fe63dc92268755005ec30e77546257d2cec',og_title='60af18da2d94e276042b216c0da0c318654f5d960f53f430ffd354927a55ebf7',og_desc='ffd5031f9a3b7bbc85b42b48443f9fe63dc92268755005ec30e77546257d2cec',h1='0de56c52789e8a9b0f1b329fa85603cf2728f5e71b7b663b9e552800484ddaad'),
'blog/puerto-rico-bioluminescent-bay-tours.html':dict(title='fb8c55561a8e86438c434873e44f4b308ad871a3e737d0584dbf74c9d6b3fcf1',meta_desc='5a41311be6c1986d08309642b2c1dd9e558f15e814eae06e84005a124df3c547',og_title='ABSENT',og_desc='ABSENT',h1='fbb3965bcb89ae6b9046ddacab9783d56ef8b84706a5fd67f9423ebe0b3aa988'),
'bio-bay-tours-puerto-rico.html':dict(title='2b51fe1e12f856c7f541f8e83022bd1dcd43e2dcea0a3dc3b3b5b9c5c133d982',meta_desc='ABSENT',og_title='ABSENT',og_desc='ABSENT',h1='ABSENT'),
'blog/best-bioluminescent-bay-tours-puerto-rico.html':dict(title='326b53257f75d9d7f9e6eab396cdf08b024c43498ca72496e1a99383b6677b79',meta_desc='ABSENT',og_title='ABSENT',og_desc='ABSENT',h1='ABSENT'),
'blog/top-5-bio-bay-experiences-ranked.html':dict(title='4b2361e69e3f9abc267589a508a83a2cd0584817b696903c274a2f73489b2360',meta_desc='ABSENT',og_title='ABSENT',og_desc='ABSENT',h1='ABSENT'),
'blog/bioluminescent-bay-vieques-vs-fajardo-vs-parguera.html':dict(title='0d3e29e8ef3e18c9d7beb3fcc036882ffeb6a9631be123d285e36680ea871ab3',meta_desc='58962e9b7ed1ba8148881f6bdc172a7c1d79390a040c4b4d615aea4f297b3da3',og_title='63f920df82f04df9357b67acadbdb1567b081006db2c5d16a1bd918db5ce8ad8',og_desc='ABSENT',h1='629bdd9e4d4222cb82a29c2d13727a4d1f19cbec0673dd53a2623a1f992c256d')}
def meta(h,attr,val):
    m=re.search(r'<meta\s+[^>]*?'+attr+r'\s*=\s*["\']'+re.escape(val)+r'["\'][^>]*?content\s*=\s*("([^"]*)"|\'([^\']*)\')',h,re.I|re.S)
    if not m: m=re.search(r'<meta\s+[^>]*?content\s*=\s*("([^"]*)"|\'([^\']*)\')[^>]*?'+attr+r'\s*=\s*["\']'+re.escape(val)+r'["\']',h,re.I|re.S)
    return None if not m else (m.group(2) if m.group(2) is not None else m.group(3))
def fields(h):
    t=re.search(r'<title[^>]*>(.*?)</title>',h,re.I|re.S); h1=re.search(r'<h1[^>]*>(.*?)</h1>',h,re.I|re.S)
    return dict(title=t and t.group(1),meta_desc=meta(h,'name','description'),og_title=meta(h,'property','og:title'),og_desc=meta(h,'property','og:description'),h1=h1 and h1.group(1))
sha=lambda s:'ABSENT' if s is None else hashlib.sha256(s.encode()).hexdigest()
bad=0;n=0
for f,exp in BASE.items():
    h=open(f,encoding='utf-8').read(); got={k:sha(v) for k,v in fields(h).items()}
    for k in exp:
        n+=1; ok=got[k]==exp[k]; bad+=(not ok); print(f'{"OK  " if ok else "FAIL"} {f} {k} {got[k][:16]}')
print(f'FENCE fields={n} fail={bad}'); sys.exit(1 if bad or n!=30 else 0)
