import os
import json
import subprocess

CALENDAR_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'calendar')

def main():
    if not os.path.exists(CALENDAR_DIR):
        os.makedirs(CALENDAR_DIR)

    # Find all .ics files in the calendar folder
    ics_files = [f for f in os.listdir(CALENDAR_DIR) if f.lower().endswith('.ics')]
    ics_files.sort()

    # Write manifest.json
    manifest_path = os.path.join(CALENDAR_DIR, 'manifest.json')
    with open(manifest_path, 'w') as f:
        json.dump(ics_files, f, indent=2)

    print(f"✅ Calendar manifest updated — {len(ics_files)} file(s) found:")
    for f in ics_files:
        print(f"   - {f}")

    if not ics_files:
        print("⚠️  No .ics files found in /calendar/ folder.")
        print("    Export your Google Calendars and drop them in there.")

    # Git push
    site_dir = os.path.dirname(os.path.abspath(__file__))
    try:
        subprocess.run(['git', 'add', '.'], cwd=site_dir, check=True)
        # Don't fail if nothing changed — just skip commit
        result = subprocess.run(['git', 'commit', '-m', 'update calendar availability'], cwd=site_dir)
        subprocess.run(['git', 'push'], cwd=site_dir, check=True)
        print("✅ Site pushed to GitHub — Netlify will deploy shortly.")
    except subprocess.CalledProcessError as e:
        print(f"⚠️  Git push failed: {e}")
        print("    Make sure Git is set up and you're logged in.")

if __name__ == '__main__':
    main()