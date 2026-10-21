import SwiftUI

public struct RGBA: Sendable {
    public let red, green, blue: Double
    public let alpha: Double

    public init(_ red: Int, _ green: Int, _ blue: Int, _ alpha: Double) {
        self.red = Double(red) / 255
        self.green = Double(green) / 255
        self.blue = Double(blue) / 255
        self.alpha = alpha
    }
}

public struct DynamicColor: Sendable {
    public let light: RGBA
    public let dark: RGBA

    public var color: Color {
        #if canImport(UIKit)
        Color(uiColor: UIColor { traits in
            let c = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: c.red, green: c.green, blue: c.blue, alpha: c.alpha)
        })
        #else
        Color(.sRGB, red: light.red, green: light.green, blue: light.blue, opacity: light.alpha)
        #endif
    }
}
