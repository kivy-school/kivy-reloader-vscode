import trio
from kivy.lang.builder import Builder
from kivy_reloader.app import App
from kivy.uix.label import Label
from os.path import dirname, join

from kivy.uix.boxlayout import BoxLayout

kv = """
Button:
    text: "Hello World"
StackLayout:
    orientation: "lr-tb"
    $0    
"""



class MyApp(App):
    def build(self):
        #return Label(text="Hello, Kivy!")
        box = BoxLayout(orientation='vertical')
        box.add_widget(Label(text="Hello, Kivy!........."))
        box.add_widget(Builder.load_file(join(dirname(__file__), "my.kv")))
        return box




def main():
    app = MyApp()
    app.run()