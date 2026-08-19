import os
import sys
from pathlib import Path

# Tên file kết quả đầu ra
OUTPUT_FILENAME = "z.tree_structure.txt"
# Tên của chính script này để bỏ qua khi quét
CURRENT_SCRIPT_NAME = Path(__file__).name if "__file__" in globals() else "z.generate_tree.py"

def format_size(bytes_size):
    """Chuyển đổi kích thước byte sang B, KB, MB, GB"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:.2f} {unit}" if unit != 'B' else f"{bytes_size} B"
        bytes_size /= 1024.0
    return f"{bytes_size:.2f} PB"

def get_dir_size(path):
    """Tính tổng dung lượng thư mục và tất cả file con bên trong"""
    total = 0
    try:
        for entry in os.scandir(path):
            try:
                # Bỏ qua file script và file output nếu nằm trong root
                if entry.name in (OUTPUT_FILENAME, CURRENT_SCRIPT_NAME):
                    continue
                if entry.is_file(follow_symlinks=False):
                    total += entry.stat().st_size
                elif entry.is_dir(follow_symlinks=False):
                    total += get_dir_size(entry.path)
            except (PermissionError, FileNotFoundError):
                continue
    except (PermissionError, FileNotFoundError):
        pass
    return total

def build_tree_lines(current_path, prefix=""):
    """Duyệt đệ quy và vẽ sơ đồ cây thư mục"""
    lines = []
    try:
        entries = [
            e for e in os.scandir(current_path)
            if e.name not in (OUTPUT_FILENAME, CURRENT_SCRIPT_NAME)
        ]
    except (PermissionError, FileNotFoundError):
        return lines

    # Sắp xếp: Thư mục lên trước, file sau (theo thứ tự chữ cái A-Z)
    entries.sort(key=lambda e: (not e.is_dir(), e.name.lower()))
    
    total_entries = len(entries)
    for index, entry in enumerate(entries):
        is_last = (index == total_entries - 1)
        connector = "└── " if is_last else "├── "
        child_prefix = "    " if is_last else "│   "
        
        try:
            if entry.is_dir(follow_symlinks=False):
                dir_size = get_dir_size(entry.path)
                lines.append(f"{prefix}{connector}{entry.name}/ [{format_size(dir_size)}]")
                lines.extend(build_tree_lines(entry.path, prefix + child_prefix))
            else:
                file_size = entry.stat().st_size
                lines.append(f"{prefix}{connector}{entry.name} ({format_size(file_size)})")
        except (PermissionError, FileNotFoundError):
            continue

    return lines

def main():
    # Tự động lấy thư mục nơi file script đang nằm
    if getattr(sys, 'frozen', False):
        current_folder = Path(sys.executable).parent
    elif "__file__" in globals():
        current_folder = Path(__file__).resolve().parent
    else:
        current_folder = Path.cwd()

    output_path = current_folder / OUTPUT_FILENAME

    print(f"[*] Đang quét thư mục: {current_folder}")
    print("[*] Đang tính toán kích thước, vui lòng chờ...")

    root_size = get_dir_size(current_folder)
    folder_name = current_folder.name if current_folder.name else str(current_folder)
    
    tree_lines = [f"{folder_name}/ [{format_size(root_size)}]"]
    tree_lines.extend(build_tree_lines(current_folder))

    result_text = "\n".join(tree_lines)

    # Ghi file kết quả tại đúng thư mục đó
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(result_text)

    print(f"\n[✓] Hoàn tất! Đã xuất sơ đồ cây tại: {output_path.name}")
    print(f"[✓] Tổng số dòng: {len(tree_lines)}")

if __name__ == "__main__":
    main()