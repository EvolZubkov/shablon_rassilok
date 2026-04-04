import tkinter as tk
from PIL import Image, ImageTk, ImageSequence
import io, base64

b64 = open('splash_b64.txt', 'r', encoding='ascii').read().strip()
print(f"b64 длина: {len(b64)}")

data = base64.b64decode(b64)
print(f"decoded: {len(data)} байт")

img = Image.open(io.BytesIO(data))
print(f"Image OK: {img.size}, mode={img.mode}, format={img.format}")

# Сначала создаём окно — потом PhotoImage!
root = tk.Tk()
root.geometry("320x384")
canvas = tk.Canvas(root, width=320, height=384, bg='#29b6d6')
canvas.pack()

frames = []
durations = []
for frame in ImageSequence.Iterator(img):
    f = frame.copy().convert('RGBA').resize((320, 320))
    frames.append(ImageTk.PhotoImage(f))
    durations.append(frame.info.get('duration', 60))
print(f"Кадров: {len(frames)}")

gif_item = canvas.create_image(160, 160, anchor='center')

idx = [0]
def play():
    i = idx[0]
    if i < len(frames):
        canvas.itemconfig(gif_item, image=frames[i])
        idx[0] += 1
        root.after(durations[i], play)
    else:
        print("Гифка закончилась!")

root.after(100, play)
root.mainloop()