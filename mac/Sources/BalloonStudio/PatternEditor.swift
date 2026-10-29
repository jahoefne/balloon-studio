import SwiftUI
import AppKit

extension FilamentColor {
    var nsColor:NSColor {
        let n=UInt32(hex.dropFirst(),radix:16)!
        return NSColor(calibratedRed:Double((n>>16)&255)/255,green:Double((n>>8)&255)/255,blue:Double(n&255)/255,alpha:1)
    }
}

struct PatternEditor:View {
    @ObservedObject var model:BalloonModel
    func patternBinding<T>(_ key:WritableKeyPath<PatternSettings,T>)->Binding<T> {
        Binding(get:{model.pattern[keyPath:key]},set:{var p=model.pattern;p[keyPath:key]=$0;model.setPattern(p)})
    }
    func number(_ key:WritableKeyPath<PatternSettings,Int>)->Binding<Double> {
        Binding(get:{Double(model.pattern[keyPath:key])},set:{var p=model.pattern;p[keyPath:key]=Int($0);model.setPattern(p)})
    }
    func purgeBinding(_ key:WritableKeyPath<PurgeSettings,Double>)->Binding<Double> {
        Binding(get:{model.purge[keyPath:key]},set:{var p=model.purge;p[keyPath:key]=$0;model.setPurge(p)})
    }
    var body:some View {
        VStack(alignment:.leading,spacing:14) {
            Text("PATTERN & COLOR").font(.system(size:9,weight:.bold)).tracking(1.3).foregroundStyle(.secondary)
            Picker("Pattern",selection:patternBinding(\.style)) {
                ForEach(BalloonPattern.allCases) {Text($0.rawValue).tag($0)}
            }.accessibilityIdentifier("patternStyle")
            if model.uses3MF {
                if model.pattern.style == .stripes {
                    ParameterControl(title:"Total bands",value:number(\.bands),range:2...24,step:1,unit:"")
                    Text("Alternating colors from bottom to top. Fewer bands mean fewer changes.")
                        .font(.system(size:10)).foregroundStyle(.secondary)
                } else if model.pattern.style.hasRelief {
                    if model.pattern.style == .nightFlight {
                        Text("Little aviators at night").font(.system(size:12,weight:.semibold))
                        Text("Two detailed vintage planes on opposite sides, with looping flight paths, soft cloud banks, a clean crescent moon and stars. Raised artwork shares the body color; the cap adds one planned filament change.")
                            .font(.system(size:10)).foregroundStyle(.secondary)
                    } else {
                        Text("A night ride between two peaks").font(.system(size:12,weight:.semibold))
                        Text("Two summits on opposite sides, each with a timber station and its bullwheels on the peak. The cable swings between them, and on each rise a vintage Swiss cabin climbs with a family and their dog at the windows. Faceted mountains with snow caps and a hiking trail, firs and a chalet in the valley, a crescent moon, clouds and stars. Raised artwork shares the body color; the cap adds one planned filament change.")
                            .font(.system(size:10)).foregroundStyle(.secondary)
                    }
                    ParameterControl(title:"Relief depth",value:patternBinding(\.reliefDepth),range:1.2...4,step:0.1,unit:"mm")
                    ParameterControl(title:"Cap height",value:patternBinding(\.capHeight),range:10...28,step:1,unit:"%")
                    Text("Sculpted shapes bridge the panel grooves to keep their outlines clear. Depth is measured above the panel crests. The cap includes the hanger. Check relief edges and supports in the slicer.")
                        .font(.system(size:10)).foregroundStyle(.secondary)
                } else if model.pattern.style == .text {
                    VStack(alignment:.leading,spacing:6) {
                        Text("Your text").font(.system(size:11,weight:.medium))
                        TextField("Name or message",text:patternBinding(\.text))
                            .textFieldStyle(.roundedBorder)
                            .accessibilityLabel("Balloon text").accessibilityIdentifier("balloonText")
                    }
                    Picker("Font",selection:patternBinding(\.textFont)) {
                        ForEach(BalloonTextFont.allCases) {font in
                            Text(font.rawValue).font(.custom(font.postScriptName,size:13)).tag(font)
                        }
                    }.accessibilityIdentifier("balloonTextFont")
                    ParameterControl(title:"Repeats around balloon",value:number(\.textRepeats),range:1...24,step:1,unit:"")
                    ParameterControl(title:"Text height",value:patternBinding(\.textHeight),range:3...model.pattern.maximumTextHeight(model.parameters),step:1,unit:"mm")
                    Text("\(model.pattern.textRepeats) \(model.pattern.textRepeats == 1 ? "copy":"copies"), evenly spaced in one row. Long messages shrink to fit. Use fewer repeats for larger letters. Up to 64 characters.")
                        .font(.system(size:10)).foregroundStyle(.secondary)
                    if model.pattern.text.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty {
                        Text("Enter a name or message to add lettering.").font(.system(size:10)).foregroundStyle(.secondary)
                    }
                } else {
                    ParameterControl(title:"Shapes per row",value:number(\.repeats),range:1...24,step:1,unit:"")
                    ParameterControl(title:"Rows",value:number(\.rows),range:1...6,step:1,unit:"")
                    ParameterControl(title:"Shape size",value:patternBinding(\.size),range:3...model.pattern.maximumSize(model.parameters),step:1,unit:"mm")
                    Text("\(model.pattern.repeats*model.pattern.rows) shapes. Size is limited to keep them apart. More rows or taller shapes usually add waste; more shapes on the same layers need not.")
                        .font(.system(size:10)).foregroundStyle(.secondary)
                }
                if model.pattern.style.hasRelief {
                    colorPicker("Body & relief · filament 1",key:\.flightBody)
                    colorPicker("Cap · filament 2",key:\.flightCap)
                } else {
                    colorPicker("Base · filament 1",key:\.base)
                    colorPicker("Pattern · filament 2",key:\.detail)
                }
                if model.pattern.baseColor == model.pattern.detailColor {
                    Text("Matching colors use one filament: no pattern color changes.").font(.system(size:10)).foregroundStyle(.secondary)
                }
                DisclosureGroup("P2S waste assumptions") {
                    VStack(alignment:.leading,spacing:12) {
                        Picker("Layer height",selection:purgeBinding(\.layerHeight)) {
                            ForEach([0.08,0.12,0.16,0.20,0.24,0.28,0.32],id:\.self) {Text(String(format:"%.2f mm",$0)).tag($0)}
                        }
                        ParameterControl(title:"Base → pattern",value:purgeBinding(\.baseToDetail),range:0...1500,step:10,unit:"mm³")
                        ParameterControl(title:"Pattern → base",value:purgeBinding(\.detailToBase),range:0...1500,step:10,unit:"mm³")
                        ParameterControl(title:"Flush multiplier",value:purgeBinding(\.multiplier),range:0...2,step:0.1,unit:"×")
                        ParameterControl(title:"Density (g/cm³)",value:purgeBinding(\.density),range:0.5...2,step:0.01,unit:"")
                        Text("400 mm³ per change is an editable example, not a measured P2S default. Copy both directional volumes and the multiplier from Bambu Studio. Use compatible filaments and match the layer height when slicing.")
                            .font(.system(size:10)).foregroundStyle(.secondary)
                        Link("About Bambu flushing volumes",destination:URL(string:"https://wiki.bambulab.com/en/software/bambu-studio/reduce-wasting-during-filament-change")!)
                            .font(.system(size:10))
                    }.padding(.top,10)
                }.font(.system(size:11))
                Text("3MF preserves filament painting. In Bambu Studio, map the two colors to your AMS filaments and select your P2S profile. Set the object’s default filament to your base color too.")
                    .font(.system(size:10)).foregroundStyle(.secondary)
            }
        }
    }
    func colorPicker(_ title:String,key:WritableKeyPath<PatternSettings,FilamentColor>)->some View {
        HStack {
            Circle().fill(Color(nsColor:model.pattern[keyPath:key].nsColor)).frame(width:14,height:14)
            Picker(title,selection:patternBinding(key)) {
                ForEach(FilamentColor.allCases) {Text($0.rawValue).tag($0)}
            }
        }.font(.system(size:11))
    }
}

struct PurgeSummary:View {
    @ObservedObject var model:BalloonModel
    var body:some View {
        VStack(alignment:.leading,spacing:5) {
            HStack {
                Label("P2S · estimated filament poop",systemImage:"arrow.triangle.2.circlepath").font(.system(size:12,weight:.semibold))
                Spacer()
                Text(model.updating ? "Updating…":grams).font(.system(size:18,weight:.semibold,design:.rounded)).monospacedDigit()
            }
            Text("\(changes) · \(model.estimate.mixedLayers) layers using both colors")
                .font(.system(size:11)).foregroundStyle(.secondary)
            Text("Change-related chute waste only. Range reflects color ordering; excludes startup purge, prime tower and supports. Flushing into infill can reduce it. Preview estimate; confirm in Bambu Studio after slicing.")
                .font(.system(size:10)).foregroundStyle(.secondary).fixedSize(horizontal:false,vertical:true)
        }.padding(12).background(accent.opacity(0.07),in:RoundedRectangle(cornerRadius:10))
    }
    var grams:String {
        let e=model.estimate
        if abs(e.maximumGrams-e.minimumGrams)<0.05 {return String(format:"≈ %.1f g",e.maximumGrams)}
        return String(format:"≈ %.1f–%.1f g",e.minimumGrams,e.maximumGrams)
    }
    var changes:String {
        let e=model.estimate
        if e.minimumChanges == e.maximumChanges {
            return "\(e.minimumChanges) color \(e.minimumChanges == 1 ? "change":"changes")"
        }
        return "\(e.minimumChanges)–\(e.maximumChanges) color changes"
    }
}
