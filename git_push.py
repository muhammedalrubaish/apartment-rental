import os, shutil, stat, subprocess

cwd = r"g:\ملفاتي\1مشاريع الذكاء الاصطناعي\RentApartment"
git_dir = os.path.join(cwd, ".git")

def remove_readonly(func, path, excinfo):
    os.chmod(path, stat.S_IWRITE)
    func(path)

if os.path.exists(git_dir):
    try:
        shutil.rmtree(git_dir, onerror=remove_readonly)
        print("Successfully cleaned old .git folder!")
    except Exception as e:
        print("Notice on rmtree:", e)

# 1. Git init
p1 = subprocess.run(["git", "init"], cwd=cwd, capture_output=True, text=True)
print("INIT:", p1.stdout, p1.stderr)

# 2. Config & Remote
subprocess.run(["git", "config", "user.name", "muhammedalrubaish"], cwd=cwd)
subprocess.run(["git", "config", "user.email", "muhammedalrubaish@gmail.com"], cwd=cwd)
subprocess.run(["git", "remote", "remove", "origin"], cwd=cwd, capture_output=True)
subprocess.run(["git", "remote", "add", "origin", "https://github.com/muhammedalrubaish/apartment-rental.git"], cwd=cwd)
subprocess.run(["git", "branch", "-M", "main"], cwd=cwd)

# 3. Add & Commit
p2 = subprocess.run(["git", "add", "-A"], cwd=cwd, capture_output=True, text=True)
print("ADD:", p2.stdout, p2.stderr)

p3 = subprocess.run(["git", "commit", "-m", "Update luxury apartment website design and features"], cwd=cwd, capture_output=True, text=True)
print("COMMIT:", p3.stdout, p3.stderr)

# 4. Push
p4 = subprocess.run(["git", "push", "-u", "origin", "main", "--force"], cwd=cwd, capture_output=True, text=True)
print("PUSH STDOUT:", p4.stdout)
print("PUSH STDERR:", p4.stderr)
