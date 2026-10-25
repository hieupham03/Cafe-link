"""Build the final paper from frozen artifacts and real experiment JSON, not typed metrics."""
from pathlib import Path
import json,shutil,re,hashlib

ROOT=Path(__file__).resolve().parents[2]
REPORT=ROOT/'report';RUN=REPORT/'evidence/cafelink-final/20261025-final-r2'

def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def number(v,digits=0):
    return (f'{v:,.{digits}f}'.replace(',','~').replace('.',',').replace('~','.'))
def table(headers,rows):
    return '\n'.join(['| '+' | '.join(headers)+' |','|'+'|'.join(['---']*len(headers))+'|']+['| '+' | '.join(map(str,row))+' |' for row in rows])

def figures(out):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import FancyBboxPatch
    plt.rcParams.update({'font.family':'DejaVu Sans','svg.hashsalt':'cafelink-final-20261025'})
    def box(ax,x,y,w,h,label,color='#eaf2e6'):
        ax.add_patch(FancyBboxPatch((x,y),w,h,boxstyle='round,pad=0.08,rounding_size=.12',fc=color,ec='#28523f',lw=1.3));ax.text(x+w/2,y+h/2,label,ha='center',va='center',fontsize=10)
    def arrow(ax,a,b,label='',style='-'):
        ax.annotate('',xy=b,xytext=a,arrowprops={'arrowstyle':'->','color':'#28523f','lw':1.4,'linestyle':style})
        if label:ax.text((a[0]+b[0])/2,(a[1]+b[1])/2+.14,label,ha='center',fontsize=8)
    fig,ax=plt.subplots(figsize=(11,4.6),layout='constrained');ax.set(xlim=(0,12),ylim=(0,5));ax.axis('off')
    box(ax,.2,2.5,2.1,1.2,'Guest / staff\nReact browser')
    box(ax,3.5,2.5,2.2,1.2,'Java Gateway\nHTTP + WebSocket')
    box(ax,7,2.5,2.1,1.2,'Java TCP Core\nService + guards')
    box(ax,10.1,2.5,1.7,1.2,'SQLite\nschema 11')
    box(ax,.2,.3,2.1,.9,'IndexedDB journal','#fff2d8');arrow(ax,(1.25,2.5),(1.25,1.2))
    box(ax,3.5,4.1,2.2,.6,'Quick Tunnel (public)','#e7eff8');arrow(ax,(4.6,4.1),(4.6,3.7),style='--')
    arrow(ax,(2.3,3.3),(3.5,3.3),'HTTP(S)');arrow(ax,(5.7,3.3),(7,3.3),'TCP frames');arrow(ax,(9.1,3.1),(10.1,3.1),'JDBC')
    arrow(ax,(3.5,2.8),(2.3,2.8),'WS(S)');ax.text(7.9,1.7,'Receipt + business state commit together\nGateway does not bypass the TCP Core',ha='center',fontsize=10)
    fig.savefig(out/'architecture.png',dpi=180);fig.savefig(out/'architecture.svg');plt.close(fig)
    fig,ax=plt.subplots(figsize=(10.5,5),layout='constrained');ax.set(xlim=(0,10),ylim=(0,7));ax.axis('off')
    lanes=[(1,'Browser / journal'),(4.5,'Gateway / TCP'),(8,'Core / SQLite')]
    for x,label in lanes:ax.text(x,6.6,label,ha='center',weight='bold',fontsize=10);ax.plot([x,x],[.5,6.25],color='#9eae9d',ls='--',lw=1)
    arrow(ax,(1,5.8),(4.5,5.8),'same command ID / payload')
    arrow(ax,(4.5,5.1),(8,5.1),'forward framed command')
    ax.text(8.1,4.55,'commit order + receipt',fontsize=9,ha='center',bbox={'facecolor':'#eaf2e6','edgecolor':'#719474','pad':5})
    arrow(ax,(8,3.9),(4.5,3.9),'success')
    ax.plot([4.45,1.3],[3.35,3.35],color='#b24d45',ls='--');ax.text(2.8,3.5,'response lost',ha='center',color='#a3433c',fontsize=9)
    ax.text(1,2.85,'pending stays in journal',ha='center',fontsize=9)
    arrow(ax,(1,2.3),(8,2.3),'GET_OUTCOME, same principal / ID')
    arrow(ax,(8,1.55),(1,1.55),'existing receipt: one order')
    ax.text(5,.55,'Transport delivery and business acceptance are different observations',ha='center',fontsize=10)
    fig.savefig(out/'recovery-sequence.png',dpi=180);fig.savefig(out/'recovery-sequence.svg');plt.close(fig)
    (out/'architecture.mmd').write_text('flowchart LR\n B[Browser and IndexedDB] -->|HTTP HTTPS| G[Java Gateway]\n G -->|TCP framed JSON| C[Core]\n C -->|JDBC| D[(SQLite)]\n G -->|WS WSS| B\n T[Quick Tunnel] -.-> G\n',encoding='utf-8')

def main():
    summary=read(RUN/'summary.json');analysis=read(RUN/'analysis.json');env=read(RUN/'environment.json')
    if summary['status']!='PASS' or analysis['status']!='PASS':raise ValueError('Only a passing complete campaign may populate the paper')
    raw=read(RUN/'load/results.json');policies={p['policy']:p for p in analysis['policies']}
    release_path=ROOT/'dist/CafeLink-Web-V9.3/RELEASE.json'
    release=read(release_path if release_path.exists() else REPORT/'evidence/cafelink-final/frozen-release.json')
    assert env['jarSha256']==release['jarSha256'] and env['productionManifestSha256']==release['frontendManifestSha256']
    assert analysis['recoveryCases']==120 and analysis['loadCases']==12
    out=REPORT/'assets/cafelink-final';out.mkdir(parents=True,exist_ok=True);figures(out)
    for suffix in ['png','svg']:shutil.copy2(RUN/f'results.{suffix}',out/f'results.{suffix}')
    gate=REPORT/'evidence/cafelink-v2/v9.3-gate/20261025-184703-1bdff3d4'
    shutil.copy2(gate/'shop-mobile-viewport.png',out/'guest-navigation.png');shutil.copy2(gate/'shop-mobile-cart.png',out/'guest-cart.png')
    environment=[['OS',env['os']],['CPU',env['cpu']],['RAM / logical processors',f"{number(env['memoryBytes'])} byte / {env['logicalProcessors']}"],['Java',f"JDK {env['javaVersion']}, target 17; gói runtime JRE 17"],['Node / Python',f"{env['node']} / {env['python']}"],['Topology','Một host; browser → Gateway → TCP Core → SQLite qua loopback'],['Dữ liệu / payment','Sáu bàn, tám món seed, private visits; LOCAL_SIMULATOR'],['Seed / lặp','20261023; recovery 5 lần, tải 3 lần/mức']]
    metrics=[('duplicateOrders','Đơn trùng'),('unconfirmedOrderEffects','Đơn tự gửi trước xác nhận'),('expiredNeedServiceEffects','Ticket khi giả định hết nhu cầu'),('wrongVisitEffects','Tác dụng sai lượt'),('confirmRequired','Ý định chờ quyết định')]
    prows=[[label]+[str(policies[p][key]) for p in ['REPLAY_ALL','REVIEW','SEMANTIC']] for key,label in metrics]
    for key,label in [('p50RecoveryMs','p50 đối chiếu, ms'),('p95RecoveryMs','p95 đối chiếu, ms')]:prows.append([label]+[number(policies[p][key],2) for p in ['REPLAY_ALL','REVIEW','SEMANTIC']])
    lrows=[[row['clients'],row['repeat'],row['successfulFlows'],number(row['p95ResponseMs'],2),row['missedSlots'],number(row['throughputFlowsPerSecond'],2)] for row in analysis['load']]
    oracles=[o for row in raw for o in row['oracle']]
    values={'ENVIRONMENT_TABLE':table(['Thành phần','Thông tin thực tế'],environment),'POLICY_TABLE':table(['Chỉ số trong tập ca','R0 REPLAY_ALL','R1 REVIEW','R2 SEMANTIC'],prows),'LOAD_TABLE':table(['Guest','Lượt','Flow','p95 response, ms','Slot lỡ','Flow/s'],lrows),'JAR_SHA':env['jarSha256'],'WEB_SHA':env['productionManifestSha256'],'EXPERIMENT_SHA':env['experimentManifestSha256'],'MEASURED_FLOWS':number(analysis['measuredFlows']),'OFFERED_SLOTS':number(sum(row['offeredSlots'] for row in raw)),'MISSED_SLOTS':number(sum(row['missedSlots'] for row in raw)),'FLOW_ERRORS':number(sum(len(row['errors']) for row in raw)),'HTTP_SAMPLES':number(sum(row['httpSamples'] for row in analysis['load'])),'HTTP_ERRORS':number(sum(row['httpErrors'] for row in analysis['load'])),'HTTP_BYTES':number(sum(row['httpDecodedBodyBytes'] for row in analysis['load'])),'TOTAL_ORDERS':number(sum(row['orders'] for row in oracles)),'TOTAL_PAYMENTS':number(sum(row['paidPayments'] for row in oracles)),'TOTAL_VND':number(sum(row['totalVnd'] for row in oracles)),'R0_UNCONFIRMED':policies['REPLAY_ALL']['unconfirmedOrderEffects'],'R0_SERVICE':policies['REPLAY_ALL']['expiredNeedServiceEffects'],'R1_SERVICE':policies['REVIEW']['expiredNeedServiceEffects'],'R2_SERVICE':policies['SEMANTIC']['expiredNeedServiceEffects']}
    text=(REPORT/'templates/CafeLink_Final_Report.template.md').read_text(encoding='utf-8')
    for key,value in values.items():text=text.replace('{{'+key+'}}',str(value))
    if re.search(r'\{\{[A-Z_]+\}\}',text):raise ValueError('Unresolved report field')
    target=REPORT/'CafeLink_Final_Report.md';target.write_text(text,encoding='utf-8')
    (out/'metrics.json').write_text(json.dumps(values,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'report':str(target),'words':len(text.split()),'recoveryCases':analysis['recoveryCases'],'loadCases':analysis['loadCases'],'flows':analysis['measuredFlows']},ensure_ascii=False))

if __name__=='__main__':main()
