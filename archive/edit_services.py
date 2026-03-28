import sys

filepath = r'j:\git\rosettastone2\index.html'
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.read().splitlines()

# Search for "const SERVICES = [" and "];" just after it
start_idx = -1
end_idx = -1
for i, line in enumerate(lines):
    if line.startswith('const SERVICES = ['):
        start_idx = i
        break

if start_idx != -1:
    for i in range(start_idx, len(lines)):
        if lines[i].startswith('];'):
            end_idx = i
            break

if start_idx != -1 and end_idx != -1:
    # replace the block with let SERVICES = [];
    lines = lines[:start_idx] + ["let csOParentServiceData = [];", "let csoPricingData = [];", "let csoExceptionData = [];"] + lines[end_idx+1:]
    
    with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')
    print("Replaced SERVICES successfully.")
else:
    print("Could not find SERVICES block.")
