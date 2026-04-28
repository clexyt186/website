import os, re, json, subprocess
from datetime import datetime, timezone, timedelta

SITE_DIR = os.path.dirname(os.path.abspath(__file__))
CALENDAR_DIR = os.path.join(SITE_DIR, 'calendar')
OUTPUT_ICS = os.path.join(CALENDAR_DIR, 'merged_busy.ics')
SAST = timedelta(hours=2)
TODAY = datetime.now()
HORIZON = datetime(TODAY.year + 1, TODAY.month, TODAY.day)

def to_dt(raw, is_utc):
    y,mo,d,h,mi = int(raw[:4]),int(raw[4:6]),int(raw[6:8]),int(raw[9:11]),int(raw[11:13])
    if is_utc:
        dt = datetime(y,mo,d,h,mi,tzinfo=timezone.utc)+SAST
        return dt.replace(tzinfo=None)
    return datetime(y,mo,d,h,mi)

def parse_ics_file(filepath):
    with open(filepath,'r',encoding='utf-8',errors='ignore') as f:
        text = f.read()
    text = text.replace('\r\n ','').replace('\r\n','\n').replace('\r','\n')
    blocks = text.split('BEGIN:VEVENT')
    results = []
    for block in blocks[1:]:
        sm = re.search(r'DTSTART(?:;[^:]*)?:(\d{8}T\d{6})(Z?)',block)
        em = re.search(r'DTEND(?:;[^:]*)?:(\d{8}T\d{6})(Z?)',block)
        rm = re.search(r'RRULE:([^\n]+)',block)
        if not sm: continue
        start_dt = to_dt(sm.group(1), sm.group(2)=='Z')
        end_dt = to_dt(em.group(1), em.group(2)=='Z') if em else start_dt+timedelta(hours=1)
        dur = end_dt - start_dt
        if not rm:
            if TODAY <= start_dt <= HORIZON: results.append((start_dt,end_dt))
            continue
        rrule = rm.group(1)
        fm = re.search(r'FREQ=(\w+)',rrule)
        if not fm or fm.group(1)!='WEEKLY':
            if TODAY <= start_dt <= HORIZON: results.append((start_dt,end_dt))
            continue
        um = re.search(r'UNTIL=(\d{8})',rrule)
        cm = re.search(r'COUNT=(\d+)',rrule)
        bm = re.search(r'BYDAY=([^;]+)',rrule)
        day_map={'SU':6,'MO':0,'TU':1,'WE':2,'TH':3,'FR':4,'SA':5}
        tdays=([day_map[x.strip()[-2:]] for x in bm.group(1).split(',') if x.strip()[-2:] in day_map] if bm else [start_dt.weekday()])
        if um:
            u=um.group(1); until_dt=datetime(int(u[:4]),int(u[4:6]),int(u[6:8]),23,59)
        else: until_dt=HORIZON
        max_until=min(until_dt,HORIZON)
        max_count=int(cm.group(1)) if cm else 500
        count=0; cur=start_dt
        while cur<=max_until and count<max_count:
            for day in tdays:
                diff=(day-cur.weekday()+7)%7
                occ=cur+timedelta(days=diff)
                occ=occ.replace(hour=start_dt.hour,minute=start_dt.minute,second=0)
                if occ<start_dt or occ>max_until or count>=max_count: continue
                if occ>=TODAY: results.append((occ,occ+dur))
                count+=1
            cur+=timedelta(weeks=1)
    return results

def write_merged_ics(events):
    lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//CLEXYT//Availability//EN',
           'CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-TIMEZONE:Africa/Johannesburg',
           'BEGIN:VTIMEZONE','TZID:Africa/Johannesburg','BEGIN:STANDARD',
           'TZOFFSETFROM:+0200','TZOFFSETTO:+0200','TZNAME:SAST',
           'DTSTART:19700101T000000','END:STANDARD','END:VTIMEZONE']
    for i,(s,e) in enumerate(events,1):
        lines+=['BEGIN:VEVENT',
                f'DTSTART;TZID=Africa/Johannesburg:{s.strftime("%Y%m%dT%H%M%S")}',
                f'DTEND;TZID=Africa/Johannesburg:{e.strftime("%Y%m%dT%H%M%S")}',
                'SUMMARY:Busy',f'UID:clexyt-{i}@clexyt','TRANSP:OPAQUE','END:VEVENT']
    lines.append('END:VCALENDAR')
    with open(OUTPUT_ICS,'w',newline='\r\n') as f:
        f.write('\r\n'.join(lines))

def main():
    if not os.path.exists(CALENDAR_DIR): os.makedirs(CALENDAR_DIR)
    ics_files=[f for f in os.listdir(CALENDAR_DIR) if f.lower().endswith('.ics') and f!='merged_busy.ics']
    if not ics_files:
        print("⚠️  No .ics files in /calendar/ folder. Export from Google Calendar first.")
        return
    print(f"📅 Reading {len(ics_files)} calendar file(s)...")
    all_events=[]
    for fn in ics_files:
        evs=parse_ics_file(os.path.join(CALENDAR_DIR,fn))
        print(f"   {fn}: {len(evs)} events")
        all_events.extend(evs)
    all_events.sort(key=lambda x:x[0])
    write_merged_ics(all_events)
    print(f"✅ merged_busy.ics written — {len(all_events)} busy blocks")
    with open(os.path.join(CALENDAR_DIR,'manifest.json'),'w') as f:
        json.dump(['merged_busy.ics'],f)
    try:
        subprocess.run(['git','add','.'],cwd=SITE_DIR,check=True)
        subprocess.run(['git','commit','-m','update availability'],cwd=SITE_DIR)
        subprocess.run(['git','push'],cwd=SITE_DIR,check=True)
        print("✅ Pushed to GitHub — Netlify deploying.")
    except subprocess.CalledProcessError as e:
        print(f"⚠️  Git push failed: {e}")

if __name__=='__main__':
    main()