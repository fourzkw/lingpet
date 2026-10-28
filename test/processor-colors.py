"""Regression checks for chroma keys without recoloring opaque characters."""
import importlib.util
from pathlib import Path
import unittest
import numpy as np
from PIL import Image

module_spec=importlib.util.spec_from_file_location('processor',Path(__file__).resolve().parents[1]/'src/creation/processor.py')
processor=importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(processor)

class ChromaColors(unittest.TestCase):
    def settings(self,key):
        return dict(background='chroma',keyColor=key,threshold=20,feather=1,despill=True,spillTolerance=0)

    def test_opaque_skin_gold_and_purple_keep_their_rgb(self):
        pixels=np.full((40,40,4),(255,0,255,255),dtype=np.uint8)
        pixels[5:35,5:35]=(236,181,146,255)
        pixels[14:20,14:20]=(245,188,40,255)
        pixels[22:28,14:20]=(92,48,104,255)
        result=np.array(processor.chroma_matte(Image.fromarray(pixels),self.settings([255,0,255])))
        np.testing.assert_array_equal(result[10:30,10:30],pixels[10:30,10:30])
        self.assertEqual(result[0,0,3],0)
        # Warm skin at the silhouette must also survive without a red clamp.
        np.testing.assert_array_equal(result[5,15],pixels[5,15])

    def test_magenta_and_green_edges_are_unmixed_in_all_key_channels(self):
        for key in ([255,0,255],[0,255,0]):
            with self.subTest(key=key):
                pixels=np.full((20,20,4),(*key,255),dtype=np.uint8)
                pixels[5:15,5:15]=(80,80,80,255)
                pixels[4,5:15,:3]=np.uint8(np.array(key)*0.4+80*0.6)
                result=np.array(processor.chroma_matte(Image.fromarray(pixels),self.settings(key)))
                edge=result[4,9]
                self.assertLess(int(edge[:3].max())-int(edge[:3].min()),3)
                self.assertGreater(edge[3],100)
                self.assertLess(edge[3],220)
                np.testing.assert_array_equal(result[9,9],pixels[9,9])

    def test_preserve_background_keeps_rgba(self):
        image=Image.new('RGBA',(3,3),(230,160,100,123))
        np.testing.assert_array_equal(processor.chroma_matte(image,{'background':'preserve'}),image)

if __name__=='__main__': unittest.main()
