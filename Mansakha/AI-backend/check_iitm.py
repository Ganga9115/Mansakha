import requests
import re
import urllib3
urllib3.disable_warnings()

try:
    r = requests.get('https://asr.iitm.ac.in/static/js/main.6c8301ff.js', verify=False)
    matches = re.findall(r'https?://[^\s"\'`<>]+|/[a-zA-Z0-9_\-/]+', r.text)
    api_matches = [m for m in set(matches) if any(k in m.lower() for k in ['decode', 'asr', 'api', 'transcribe', 'spring', 'service'])]
    print("Found matches:")
    for m in sorted(api_matches):
        print(" -", m)
except Exception as e:
    print("Error:", e)
